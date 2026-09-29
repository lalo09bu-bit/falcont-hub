import sqlite3 from 'sqlite3';
import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const backupPath = path.join(__dirname, '..', 'db', 'backup_data.json');

// Normalizar registros para que BigInt se convierta a Number (evita errores en JSON.stringify de Express)
function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
        clean[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    return clean;
}

// Adaptador universal para Turso (LibSQL en la Nube) que emula la interfaz callback de sqlite3
class TursoAdapter {
    constructor(client) {
        this.client = client;
    }

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        params = Array.isArray(params) ? params : (params ? [params] : []);
        this.client.execute({ sql, args: params })
            .then(res => {
                const rows = (res.rows || []).map(r => normalizeRow(r));
                if (callback) callback(null, rows);
            })
            .catch(err => {
                console.error('❌ Error en consulta Turso (all):', err.message, 'SQL:', sql);
                if (callback) callback(err);
            });
    }

    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        params = Array.isArray(params) ? params : (params ? [params] : []);
        this.client.execute({ sql, args: params })
            .then(res => {
                const row = res.rows && res.rows.length > 0 ? normalizeRow(res.rows[0]) : undefined;
                if (callback) callback(null, row);
            })
            .catch(err => {
                console.error('❌ Error en consulta Turso (get):', err.message, 'SQL:', sql);
                if (callback) callback(err);
            });
    }

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        params = Array.isArray(params) ? params : (params ? [params] : []);

        const cleanSql = (sql || '').trim().toUpperCase();
        // Ignorar sentencias transaccionales aisladas en protocolo stateless HTTP
        if (cleanSql === 'BEGIN' || cleanSql === 'BEGIN IMMEDIATE TRANSACTION' || cleanSql === 'BEGIN TRANSACTION' || cleanSql === 'COMMIT' || cleanSql === 'ROLLBACK') {
            if (callback) callback.call({ lastID: 0, changes: 0 }, null);
            return;
        }

        this.client.execute({ sql, args: params })
            .then(res => {
                const context = {
                    lastID: res.lastInsertRowid !== undefined && res.lastInsertRowid !== null ? Number(res.lastInsertRowid) : 0,
                    changes: res.rowsAffected || 0
                };
                if (callback) callback.call(context, null);
            })
            .catch(err => {
                console.error('❌ Error en consulta Turso (run):', err.message, 'SQL:', sql);
                if (callback) callback.call({ lastID: 0, changes: 0 }, err);
            });
    }

    exec(sql, callback) {
        this.client.executeMultiple(sql)
            .then(() => {
                if (callback) callback(null);
            })
            .catch(err => {
                console.error('❌ Error en executeMultiple Turso:', err.message);
                if (callback) callback(err);
            });
    }

    prepare(sql) {
        const self = this;
        return {
            run(...args) {
                let callback;
                let params = [];
                if (args.length > 0 && typeof args[args.length - 1] === 'function') {
                    callback = args.pop();
                }
                if (args.length === 1 && Array.isArray(args[0])) {
                    params = args[0];
                } else {
                    params = args;
                }
                self.run(sql, params, callback);
            },
            finalize(callback) {
                if (callback) callback(null);
            }
        };
    }

    serialize(callback) {
        if (callback) callback();
    }
}

// Detección del Entorno: Turso Cloud vs SQLite Local
const isTurso = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
let db;

if (isTurso) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  ⚡ CONEXIÓN A BASE DE DATOS EN LA NUBE TURSO (LIBSQL SERVERLESS)             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  🌐 URL:    ${process.env.TURSO_DATABASE_URL.substring(0, 45)}...            
║  🛡️ Auth:   Token activo (Persistencia 100% en la Nube / Render Free)       ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
    });
    db = new TursoAdapter(client);
    initDatabase();
} else {
    const defaultDbPath = path.join(__dirname, '..', '..', 'rdl_intelligence_hub.db');
    const dbPath = process.env.DATABASE_PATH || defaultDbPath;

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        try {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`📁 Directorio para base de datos creado: ${dbDir}`);
        } catch (dirErr) {
            console.warn(`Aviso al crear directorio para SQLite: ${dirErr.message}`);
        }
    }

    const sqlite = sqlite3.verbose();
    db = new sqlite.Database(dbPath, (err) => {
        if (err) {
            console.error(`❌ Error al conectar con SQLite (${dbPath}):`, err.message);
        } else {
            console.log(`✅ Conexión a SQLite establecida en: ${dbPath}`);
            db.run('PRAGMA journal_mode = WAL;', (pErr) => {
                if (pErr) console.warn('Aviso PRAGMA journal_mode:', pErr.message);
            });
            db.run('PRAGMA foreign_keys = ON;', (fErr) => {
                if (fErr) console.warn('Aviso PRAGMA foreign_keys:', fErr.message);
            });
            initDatabase();
        }
    });
}

function initDatabase() {
    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql, (err) => {
            if (err) {
                console.warn('⚠️ Aviso al aplicar esquema RDL inicial (se continuará con migraciones):', err.message);
            } else {
                console.log('✅ Esquema RDL Intelligence Hub verificado/creado');
            }
            runMigrations();
            seedRdlData();
            seedDummyClientUser();
        });
    } else {
        runMigrations();
        seedRdlData();
        seedDummyClientUser();
    }
}

function runMigrations() {
    // 1. Migración para metas_empleado (indicador y peso)
    db.all("PRAGMA table_info(metas_empleado)", [], (err, columns) => {
        if (!err && columns && columns.length > 0) {
            const hasIndicador = columns.some(c => c.name === 'indicador');
            const hasPeso = columns.some(c => c.name === 'peso');

            if (!hasIndicador) {
                db.run("ALTER TABLE metas_empleado ADD COLUMN indicador TEXT NOT NULL DEFAULT 'Cumplimiento de objetivos'", () => {
                    console.log("✅ Columna 'indicador' agregada a metas_empleado.");
                });
            }
            if (!hasPeso) {
                db.run("ALTER TABLE metas_empleado ADD COLUMN peso REAL NOT NULL DEFAULT 33.33", () => {
                    console.log("✅ Columna 'peso' agregada a metas_empleado.");
                });
            }
        }
    });

    // 2. Migración para usuarios (Ficha estilo Buk: foto_perfil, telefono, fecha_ingreso, tipo_contrato, numero_empleado, salario_base, estatus_laboral)
    db.all("PRAGMA table_info(usuarios)", [], (err, columns) => {
        if (!err && columns && columns.length > 0) {
            const colNames = columns.map(c => c.name);

            if (!colNames.includes('foto_perfil')) {
                db.run("ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT DEFAULT NULL", () => {
                    console.log("✅ Columna 'foto_perfil' agregada a usuarios.");
                });
            }
            if (!colNames.includes('telefono')) {
                db.run("ALTER TABLE usuarios ADD COLUMN telefono TEXT DEFAULT '+52 (55) 5482-9000'", () => {
                    console.log("✅ Columna 'telefono' agregada a usuarios.");
                });
            }
            if (!colNames.includes('fecha_ingreso')) {
                db.run("ALTER TABLE usuarios ADD COLUMN fecha_ingreso DATE DEFAULT '2026-01-15'", () => {
                    console.log("✅ Columna 'fecha_ingreso' agregada a usuarios.");
                });
            }
            if (!colNames.includes('tipo_contrato')) {
                db.run("ALTER TABLE usuarios ADD COLUMN tipo_contrato TEXT DEFAULT 'Tiempo Indeterminado'", () => {
                    console.log("✅ Columna 'tipo_contrato' agregada a usuarios.");
                });
            }
            if (!colNames.includes('numero_empleado')) {
                db.run("ALTER TABLE usuarios ADD COLUMN numero_empleado TEXT DEFAULT 'RDL-001'", () => {
                    console.log("✅ Columna 'numero_empleado' agregada a usuarios.");
                });
            }
            if (!colNames.includes('salario_base')) {
                db.run("ALTER TABLE usuarios ADD COLUMN salario_base TEXT DEFAULT 'Confidencial'", () => {
                    console.log("✅ Columna 'salario_base' agregada a usuarios.");
                });
            }
            if (!colNames.includes('estatus_laboral')) {
                db.run("ALTER TABLE usuarios ADD COLUMN estatus_laboral TEXT DEFAULT 'ACTIVO'", () => {
                    console.log("✅ Columna 'estatus_laboral' agregada a usuarios.");
                });
            }
            const applyDefaultRfcs = () => {
                const defaultRfcs = [
                    { email: 'rh@rdl.com.mx', rfc: 'COSR880101RDL' },
                    { email: 'admin@rdl.com.mx', rfc: 'RAMS850310RDL' },
                    { email: 'sofia.ramirez@rdl.com.mx', rfc: 'RAMS850310RDL' },
                    { email: 'abogada.sr@rdl.com.mx', rfc: 'MEVR920514RDL' },
                    { email: 'valeria.mendoza@rdl.com.mx', rfc: 'MEVR920514RDL' },
                    { email: 'abogada.jr@rdl.com.mx', rfc: 'MARA950820RDL' },
                    { email: 'ana.martinez@rdl.com.mx', rfc: 'MARA950820RDL' },
                    { email: 'mariana.torres@rdl.com.mx', rfc: 'TOMA960412RDL' },
                    { email: 'patricia.silva@adeltaconsultores.com', rfc: 'SIP901105AD1' },
                    { email: 'fernando.ortiz@rdlabogados.com.mx', rfc: 'OIF890723RD2' },
                    { email: 'analista.rh04@adeltaconsultores.com', rfc: 'COSR880101AD3' },
                    { email: 'denis@rdl.com.mx', rfc: 'RAMD940612RD1' },
                    { email: 'demo@rdl.com.mx', rfc: 'DEMO880101RDL' }
                ];
                defaultRfcs.forEach(item => {
                    db.run("UPDATE usuarios SET rfc = ? WHERE LOWER(email) = LOWER(?) AND (rfc IS NULL OR rfc = '')", [item.rfc, item.email]);
                });
            };

            if (!colNames.includes('rfc')) {
                db.run("ALTER TABLE usuarios ADD COLUMN rfc TEXT DEFAULT NULL", (alterErr) => {
                    if (!alterErr) {
                        console.log("✅ Columna 'rfc' agregada a usuarios.");
                        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_rfc ON usuarios(rfc) WHERE rfc IS NOT NULL;");
                        db.run("CREATE INDEX IF NOT EXISTS idx_usuarios_rfc_email ON usuarios(rfc, email);");
                        applyDefaultRfcs();
                    }
                });
            } else {
                applyDefaultRfcs();
            }

            if (!colNames.includes('lider_id')) {
                db.run("ALTER TABLE usuarios ADD COLUMN lider_id INTEGER DEFAULT NULL", (alterErr) => {
                    if (!alterErr) {
                        console.log("✅ Columna 'lider_id' agregada a usuarios.");
                        db.run("CREATE INDEX IF NOT EXISTS idx_usuarios_lider ON usuarios(lider_id);");
                    }
                });
            }

            // 3. Garantizar perfil de Recursos Humanos (RH) con acceso total
            db.get("SELECT id FROM usuarios WHERE rol = 'RH' OR email = 'rh@rdl.com.mx'", [], (err, rhUser) => {
                if (!err && !rhUser) {
                    console.log("🌱 Creando perfil de Dirección de Recursos Humanos (RH)...");
                    db.run(`
                        INSERT OR IGNORE INTO usuarios (email, nombre, rol, puesto, departamento, avatar, telefono, fecha_ingreso, tipo_contrato, numero_empleado, rfc, dias_vacaciones_totales, dias_vacaciones_tomados)
                        VALUES ('rh@rdl.com.mx', 'Lic. Andrés Cosmes', 'RH', 'Dirección de Recursos Humanos & Talento', 'Recursos Humanos', 'AC', '+52 (55) 5482-9000', '2023-01-01', 'Tiempo Indeterminado', 'RDL-RH01', 'COSR880101RDL', 25, 0)
                    `, function(err) {
                        if (!err) {
                            console.log("✅ Perfil de Recursos Humanos (RH) registrado con ID:", this.lastID);
                        }
                    });
                }
            });

            // 4. Migración para auth_tokens (Magic Links de Autenticación RDL)
            db.run(`
                CREATE TABLE IF NOT EXISTS auth_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    expira_en DATETIME NOT NULL,
                    usado INTEGER DEFAULT 0 CHECK(usado IN (0, 1)),
                    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
                );
            `, (err) => {
                if (!err) {
                    db.run("CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);");
                    db.run("CREATE INDEX IF NOT EXISTS idx_auth_tokens_usuario ON auth_tokens(usuario_id);");
                    console.log("✅ Tabla 'auth_tokens' e índices verificados/creados.");
                }
            });

            // 5. Migración para incidencias_vacaciones (Modalidades de Ausencias: Permisos x hora/día y líder)
            db.all("PRAGMA table_info(incidencias_vacaciones)", [], (incErr, incColumns) => {
                if (!incErr && incColumns && incColumns.length > 0) {
                    const incColNames = incColumns.map(c => c.name);
                    if (!incColNames.includes('lider_id')) {
                        db.run("ALTER TABLE incidencias_vacaciones ADD COLUMN lider_id INTEGER DEFAULT NULL", () => {
                            console.log("✅ Columna 'lider_id' agregada a incidencias_vacaciones.");
                        });
                    }
                    if (!incColNames.includes('subtipo')) {
                        db.run("ALTER TABLE incidencias_vacaciones ADD COLUMN subtipo TEXT DEFAULT 'VACACIONES'", () => {
                            console.log("✅ Columna 'subtipo' agregada a incidencias_vacaciones.");
                        });
                    }
                    if (!incColNames.includes('hora_inicio')) {
                        db.run("ALTER TABLE incidencias_vacaciones ADD COLUMN hora_inicio TEXT DEFAULT NULL", () => {
                            console.log("✅ Columna 'hora_inicio' agregada a incidencias_vacaciones.");
                        });
                    }
                    if (!incColNames.includes('hora_fin')) {
                        db.run("ALTER TABLE incidencias_vacaciones ADD COLUMN hora_fin TEXT DEFAULT NULL", () => {
                            console.log("✅ Columna 'hora_fin' agregada a incidencias_vacaciones.");
                        });
                    }
                    if (!incColNames.includes('horas_solicitadas')) {
                        db.run("ALTER TABLE incidencias_vacaciones ADD COLUMN horas_solicitadas REAL DEFAULT 0", () => {
                            console.log("✅ Columna 'horas_solicitadas' agregada a incidencias_vacaciones.");
                        });
                    }
                }
            });

            // 6. Migración para tabla de notificaciones
            db.run(`
                CREATE TABLE IF NOT EXISTS notificaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER NOT NULL,
                    remitente_id INTEGER NOT NULL,
                    remitente_nombre TEXT NOT NULL,
                    remitente_avatar TEXT,
                    tipo TEXT NOT NULL,
                    titulo TEXT NOT NULL,
                    mensaje TEXT NOT NULL,
                    referencia_id INTEGER,
                    leido INTEGER DEFAULT 0 CHECK(leido IN (0, 1)),
                    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
                );
            `, (err) => {
                if (!err) {
                    db.run("CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leido);");
                    console.log("✅ Tabla 'notificaciones' e índices verificados/creados.");
                }
            });

            // 7. Migración para tabla feed_likes (Control estricto de 1 like por usuario)
            db.run(`
                CREATE TABLE IF NOT EXISTS feed_likes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    publicacion_id INTEGER NOT NULL,
                    usuario_id INTEGER NOT NULL,
                    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(publicacion_id, usuario_id),
                    FOREIGN KEY (publicacion_id) REFERENCES feed_publicaciones(id) ON DELETE CASCADE,
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
                );
            `, (err) => {
                if (!err) {
                    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_likes_pub_user ON feed_likes(publicacion_id, usuario_id);");
                    console.log("✅ Tabla 'feed_likes' verificada/creada.");
                }
            });

            // 8. Migración para tabla de plantillas y estructuras de reportes (reportes_plantillas)
            db.run(`
                CREATE TABLE IF NOT EXISTS reportes_plantillas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    descripcion TEXT,
                    categoria TEXT DEFAULT 'CONSOLIDADO',
                    campos_seleccionados TEXT NOT NULL,
                    creado_por TEXT,
                    es_sistema INTEGER DEFAULT 0,
                    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `, (err) => {
                if (!err) {
                    db.run("CREATE INDEX IF NOT EXISTS idx_reportes_categoria ON reportes_plantillas(categoria);");
                    console.log("✅ Tabla 'reportes_plantillas' e índices verificados/creados.");
                    seedReportesPlantillas();
                }
            });
        }
    });
}

function seedRdlData() {
    db.get('SELECT COUNT(*) as count FROM usuarios', [], (err, row) => {
        if (!err && row && row.count === 0) {
            console.log('🌱 Poblando usuarios iniciales con Ficha Buk (RH, Admin, Abogada SR, Abogada JR)...');

            const insertUser = db.prepare(`
                INSERT INTO usuarios (email, nombre, rol, puesto, departamento, avatar, telefono, fecha_ingreso, tipo_contrato, numero_empleado, rfc, dias_vacaciones_totales, dias_vacaciones_tomados)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insertUser.run(
                'rh@rdl.com.mx', 'Lic. Andrés Cosmes', 'RH', 'Dirección de Recursos Humanos & Talento',
                'Recursos Humanos', 'AC', '+52 (55) 5482-9000', '2023-01-01', 'Tiempo Indeterminado', 'RDL-RH01', 'COSR880101RDL', 25, 0
            );
            insertUser.run(
                'admin@rdl.com.mx', 'Lic. Sofia Ramirez', 'ADMIN', 'Directora de Talent & Legal',
                'Dirección General', 'SR', '+52 (55) 5482-9001', '2023-03-01', 'Tiempo Indeterminado', 'RDL-001', 'RAMS850310RDL', 20, 5
            );
            insertUser.run(
                'abogada.sr@rdl.com.mx', 'Lic. Valeria Mendoza', 'ABOGADA_SR', 'Abogada Senior Corporativo',
                'Legal & Talent RDL', 'VM', '+52 (55) 5482-9002', '2024-06-15', 'Tiempo Indeterminado', 'RDL-014', 'MEVR920514RDL', 15, 3
            );
            insertUser.run(
                'abogada.jr@rdl.com.mx', 'Lic. Ana Martinez', 'ABOGADA_JR', 'Abogada Junior de Litigio',
                'Legal & Talent RDL', 'AM', '+52 (55) 5482-9003', '2025-01-10', 'Tiempo Indeterminado', 'RDL-028', 'MARA950820RDL', 12, 2
            );

            insertUser.finalize(() => {
                console.log('✅ Usuarios RDL registrados con ficha Buk y RFC.');
                seedFeedAndMetas();
            });
        } else {
            seedFeedAndMetas();
        }
    });
}

function seedFeedAndMetas() {
    db.get('SELECT COUNT(*) as count FROM feed_publicaciones', [], (err, row) => {
        if (!err && row && row.count === 0) {
            console.log('📢 Generando publicaciones iniciales para el Muro estilo Facebook RDL...');
            
            const insertFeed = db.prepare(`
                INSERT INTO feed_publicaciones (autor_id, autor_nombre, autor_rol, autor_avatar, titulo, contenido, categoria, likes_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insertFeed.run(
                1, 'Lic. Sofia Ramirez', 'ADMIN', 'SR',
                '¡Bienvenidas a la plataforma RDL Intelligence Hub!',
                'Iniciamos oficialmente operaciones en nuestra plataforma interconectada en tiempo real (Astro + Floating-UI). Aquí compartiremos comunicados oficiales, avisos legales, seguimiento de casos, metas ponderadas (100%), directorio Buk y el control de vacaciones.',
                'Corporativo', 5
            );

            insertFeed.run(
                2, 'Lic. Valeria Mendoza', 'ABOGADA_SR', 'VM',
                'Actualización de Criterios de Contratación Q3 2026',
                'Equipo Legal: hemos actualizado la plantilla estándar de contratos para clientes corporativos. Por favor revisen la documentación compartida.',
                'Aviso Legal', 3
            );

            insertFeed.finalize();
        }
    });

    db.get('SELECT COUNT(*) as count FROM metas_empleado', [], (err, row) => {
        if (!err && row && row.count === 0) {
            console.log('🎯 Asignando metas iniciales con ponderación 100%...');
            
            const insertMeta = db.prepare(`
                INSERT INTO metas_empleado (usuario_id, titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Metas para Abogada JR (Ana Martinez - ID 3) - Total Pesos: 40% + 35% + 25% = 100%
            insertMeta.run(
                3,
                'Revisión y Dictamen de Expedientes',
                'Revisión exhaustiva y dictaminación jurídica de expedientes laborales de nuevo ingreso.',
                '15 expedientes dictaminados por semana (≥95% efectividad)',
                40.0,
                85.0,
                'Caso Legal',
                '2026-09-30',
                'EN_PROGRESO'
            );

            insertMeta.run(
                3,
                'Cumplimiento y Asistencia a Audiencias',
                'Representación en audiencias conciliatorias y desahogo de pruebas laborales.',
                '100% de audiencias atendidas puntualmente sin diferimientos',
                35.0,
                70.0,
                'Desempeño',
                '2026-10-15',
                'EN_PROGRESO'
            );

            insertMeta.run(
                3,
                'Certificación en RDL Compliance Normativo',
                'Completar los módulos y acreditaciones en la Ley Federal del Trabajo y NOM-035.',
                'Calificación mínima de 9.0 en evaluación final',
                25.0,
                90.0,
                'Capacitación',
                '2026-09-15',
                'EN_PROGRESO'
            );

            // Metas para Abogada SR (Valeria Mendoza - ID 2) - Total Pesos: 50% + 50% = 100%
            insertMeta.run(
                2,
                'Supervisión y Dictámenes Corporativos',
                'Validación y cierre de contratos mercantiles y acuerdos de confidencialidad.',
                'Cierre de 20 dictámenes corporativos al mes',
                50.0,
                80.0,
                'Caso Legal',
                '2026-10-31',
                'EN_PROGRESO'
            );

            insertMeta.run(
                2,
                'Mentoría y Formación de Equipo Legal Junior',
                'Sesiones quincenales de capacitación y asesoría en litigio para abogadas junior.',
                '4 sesiones completadas con evaluación de satisfacción ≥ 9.5',
                50.0,
                60.0,
                'Desempeño',
                '2026-11-30',
                'EN_PROGRESO'
            );

            insertMeta.finalize();
        }
    });
}

function seedReportesPlantillas() {
    db.get('SELECT COUNT(*) as count FROM reportes_plantillas', [], (err, row) => {
        if (!err && row && row.count === 0) {
            console.log('📊 Sembrando plantillas de reportes estándar para Recursos Humanos...');
            const plantillas = [
                {
                    nombre: 'Plantilla Ficha Integral de Personal (RH Buk)',
                    descripcion: 'Expediente general del colaborador: puesto, contacto, RFC, contrato, antigüedad y líder.',
                    categoria: 'COLABORADORES',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'rfc', 'email', 'puesto', 'departamento', 'telefono', 'fecha_ingreso', 'antiguedad', 'tipo_contrato', 'estatus_laboral', 'lider_nombre', 'salario_base', 'rol']),
                    es_sistema: 1
                },
                {
                    nombre: 'Plantilla Auditoría de Vacaciones & Permisos',
                    descripcion: 'Historial de ausencias justificadas, saldos de vacaciones y permisos por hora y día.',
                    categoria: 'INCIDENCIAS',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'departamento', 'vac_totales', 'vac_tomados', 'vac_disponibles', 'inc_tipo', 'inc_subtipo', 'inc_fecha_inicio', 'inc_fecha_fin', 'inc_horario', 'inc_horas', 'inc_dias', 'inc_motivo', 'inc_estatus', 'inc_lider', 'inc_fecha_solicitud']),
                    es_sistema: 1
                },
                {
                    nombre: 'Plantilla Evaluación de Desempeño y Metas (100%)',
                    descripcion: 'Seguimiento de metas ponderadas, avance porcentual, categorías, indicadores y fechas límite.',
                    categoria: 'METAS',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'puesto', 'departamento', 'lider_nombre', 'meta_titulo', 'meta_descripcion', 'meta_indicador', 'meta_peso', 'meta_avance', 'meta_categoria', 'meta_fecha_limite', 'meta_estatus', 'meta_fecha_creacion']),
                    es_sistema: 1
                },
                {
                    nombre: 'Plantilla Consolidado Corporativo Maestro',
                    descripcion: 'Visión 360° combinando ficha del colaborador, saldo de vacaciones y desempeño de metas.',
                    categoria: 'CONSOLIDADO',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'rfc', 'email', 'puesto', 'departamento', 'fecha_ingreso', 'estatus_laboral', 'vac_disponibles', 'inc_subtipo', 'inc_dias', 'inc_estatus', 'meta_titulo', 'meta_peso', 'meta_avance', 'meta_estatus', 'lider_nombre']),
                    es_sistema: 1
                }
            ];

            const stmt = db.prepare(`
                INSERT INTO reportes_plantillas (nombre, descripcion, categoria, campos_seleccionados, creado_por, es_sistema)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            plantillas.forEach(p => {
                stmt.run(p.nombre, p.descripcion, p.categoria, p.campos, 'Sistema RDL', p.es_sistema);
            });

            stmt.finalize(() => {
                console.log('✅ Plantillas de reportes para RH inicializadas con éxito.');
            });
        }
    });
}

// 9. Garantizar usuario Dummy para Evaluación de Clientes (Acceso Total 360°)
export function seedDummyClientUser() {
    const demoEmail = 'demo@rdl.com.mx';
    const demoRfc = 'DEMO880101RDL';

    db.get("SELECT id, email, rfc FROM usuarios WHERE LOWER(email) = LOWER(?) OR UPPER(rfc) = UPPER(?) LIMIT 1", [demoEmail, demoRfc], (err, user) => {
        if (!err && !user) {
            console.log("🌱 Creando usuario Dummy para Evaluación de Clientes...");
            db.run(`
                INSERT INTO usuarios (
                    email, nombre, rol, puesto, departamento, avatar, telefono,
                    fecha_ingreso, tipo_contrato, numero_empleado, rfc,
                    dias_vacaciones_totales, dias_vacaciones_tomados, estatus_laboral, lider_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', 1)
            `, [
                demoEmail,
                'Lic. Carlos Mendoza (Cliente Demo)',
                'ADMIN',
                'Director de Operaciones & Auditoría (Demo)',
                'Dirección General & Auditoría',
                'CM',
                '+52 (55) 5482-9099',
                '2024-01-15',
                'Tiempo Indeterminado',
                'RDL-DEMO',
                demoRfc,
                20,
                4
            ], function(insertErr) {
                if (!insertErr) {
                    const demoUserId = this.lastID;
                    console.log(`✅ Usuario Dummy creado con ID: ${demoUserId}`);
                    seedDemoGoalsAndIncidencias(demoUserId);
                } else {
                    console.error("❌ Error al crear usuario dummy:", insertErr.message);
                }
            });
        } else if (user) {
            const demoUserId = user.id;
            db.run(`
                UPDATE usuarios 
                SET rol = 'ADMIN', rfc = ?, estatus_laboral = 'ACTIVO',
                    nombre = 'Lic. Carlos Mendoza (Cliente Demo)',
                    puesto = 'Director de Operaciones & Auditoría (Demo)',
                    departamento = 'Dirección General & Auditoría',
                    dias_vacaciones_totales = 20,
                    dias_vacaciones_tomados = 4
                WHERE id = ?
            `, [demoRfc, demoUserId], () => {
                seedDemoGoalsAndIncidencias(demoUserId);
            });
        }
    });
}

function seedDemoGoalsAndIncidencias(demoUserId) {
    if (!demoUserId) return;

    // 1. Metas Ponderadas (100%) para el usuario Demo
    db.get("SELECT COUNT(*) as count, SUM(peso) as total_peso FROM metas_empleado WHERE usuario_id = ?", [demoUserId], (err, row) => {
        const count = row ? row.count : 0;
        const totalPeso = row && row.total_peso ? Math.round(row.total_peso) : 0;

        if (!err && (count < 3 || totalPeso !== 100)) {
            console.log(`🎯 Asignando metas ponderadas (100%) para usuario Demo ID ${demoUserId}...`);
            db.run("DELETE FROM metas_empleado WHERE usuario_id = ?", [demoUserId], () => {
                const insertMeta = db.prepare(`
                    INSERT INTO metas_empleado (usuario_id, titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                // Meta 1 (40%): Evaluación y Adopción del Hub RDL
                insertMeta.run(
                    demoUserId,
                    'Evaluación y Adopción del Hub RDL',
                    'Supervisión y auditoría de módulos operativos: Muro, Directorio Buk, Vacaciones, Metas y Reportes.',
                    '100% de módulos operativos validados por la dirección',
                    40.0,
                    85.0,
                    'OKR',
                    '2026-10-31',
                    'EN_PROGRESO'
                );

                // Meta 2 (35%): Auditoría y Cumplimiento Normativo (NOM-035 / LFT)
                insertMeta.run(
                    demoUserId,
                    'Auditoría y Cumplimiento Normativo (NOM-035 / LFT)',
                    'Garantizar la trazabilidad de incidencias y justificación de ausencias legales.',
                    '0 incidencias sin justificación documental ni visto bueno',
                    35.0,
                    70.0,
                    'Caso Legal',
                    '2026-11-15',
                    'EN_PROGRESO'
                );

                // Meta 3 (25%): Optimización y Extracción de Reportes de Talento
                insertMeta.run(
                    demoUserId,
                    'Optimización y Extracción de Reportes de Talento',
                    'Configuración de plantillas personalizadas en Excel y análisis de métricas clave.',
                    'Generación y exportación de reportes consolidados sin errores',
                    25.0,
                    90.0,
                    'Desempeño',
                    '2026-12-15',
                    'EN_PROGRESO'
                );

                insertMeta.finalize(() => {
                    console.log("✅ Metas ponderadas (100%) registradas para usuario Demo.");
                });
            });
        }
    });

    // 2. Notificaciones en Tiempo Real para el usuario Demo
    db.get("SELECT COUNT(*) as count FROM notificaciones WHERE usuario_id = ?", [demoUserId], (notifErr, nRow) => {
        const notifCount = nRow ? nRow.count : 0;
        if (!notifErr && notifCount < 2) {
            console.log(`🔔 Sembrando notificaciones de bienvenida para usuario Demo ID ${demoUserId}...`);
            db.run("DELETE FROM notificaciones WHERE usuario_id = ?", [demoUserId], () => {
                const insertNotif = db.prepare(`
                    INSERT INTO notificaciones (usuario_id, remitente_id, remitente_nombre, remitente_avatar, tipo, titulo, mensaje, leido)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                insertNotif.run(
                    demoUserId,
                    10,
                    'Lic. Denis Ramos',
                    'DR',
                    'INCIDENCIA_SOLICITUD',
                    'Nueva Solicitud de Permiso por Día',
                    'Lic. Denis Ramos ha solicitado un Permiso por día (con goce de sueldo) para el 2026-10-05.',
                    0
                );

                insertNotif.run(
                    demoUserId,
                    1,
                    'Dirección de Talento RDL',
                    'AC',
                    'SISTEMA',
                    '¡Bienvenido al Entorno de Evaluación RDL Hub!',
                    'Tu perfil cuenta con privilegios de Administrador para evaluar todos los módulos corporativos: Muro, Reportes Excel, Fichas Buk y Metas.',
                    0
                );

                insertNotif.finalize(() => {
                    console.log("✅ Notificaciones iniciales creadas para usuario Demo.");
                });
            });
        }
    });

    // 3. Vincular a Denis Ramos como colaboradora a cargo y asegurar solicitudes pendientes para el módulo de Aprobación
    const setupDenis = (denisId) => {
        db.run("UPDATE usuarios SET lider_id = ?, rfc = COALESCE(rfc, 'RAMD940612RD1') WHERE id = ?", [demoUserId, denisId], () => {
            // Reasignar solicitudes pendientes al nuevo líder Demo
            db.run("UPDATE incidencias_vacaciones SET lider_id = ? WHERE usuario_id = ? AND estatus = 'PENDIENTE'", [demoUserId, denisId], () => {
                db.get("SELECT COUNT(*) as count FROM incidencias_vacaciones WHERE lider_id = ? AND estatus = 'PENDIENTE'", [demoUserId], (incErr, incRow) => {
                    if (!incErr && (!incRow || incRow.count === 0)) {
                        console.log("✈️ Creando incidencias de prueba para evaluar módulo de Aprobación...");
                        const insertInc = db.prepare(`
                            INSERT INTO incidencias_vacaciones (
                                usuario_id, usuario_nombre, usuario_rol, tipo, subtipo,
                                fecha_inicio, fecha_fin, hora_inicio, hora_fin, horas_solicitadas,
                                dias_solicitados, motivo, estatus, lider_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);

                        insertInc.run(
                            denisId,
                            'Lic. Denis Ramos',
                            'ABOGADA_JR',
                            'Permiso',
                            'DIA_CON_GOCE',
                            '2026-10-05',
                            '2026-10-05',
                            null,
                            null,
                            0,
                            1,
                            'Trámite oficial y renovación de pasaporte para viaje corporativo.',
                            'PENDIENTE',
                            demoUserId
                        );

                        insertInc.run(
                            denisId,
                            'Lic. Denis Ramos',
                            'ABOGADA_JR',
                            'Vacaciones',
                            'VACACIONES',
                            '2026-10-12',
                            '2026-10-16',
                            null,
                            null,
                            0,
                            5,
                            'Periodo vacacional semestral de descanso conforme a LFT.',
                            'PENDIENTE',
                            demoUserId
                        );

                        insertInc.finalize(() => {
                            console.log("✅ Incidencias pendientes creadas para que el usuario Demo pueda aprobarlas.");
                        });
                    }
                });
            });
        });
    };

    db.get("SELECT id, nombre, email FROM usuarios WHERE LOWER(email) = 'denis@rdl.com.mx' LIMIT 1", [], (denisErr, denis) => {
        if (!denisErr && denis) {
            setupDenis(denis.id);
        } else if (!denisErr && !denis) {
            db.run(`
                INSERT INTO usuarios (
                    email, nombre, rol, puesto, departamento, avatar, telefono,
                    fecha_ingreso, tipo_contrato, numero_empleado, rfc,
                    dias_vacaciones_totales, dias_vacaciones_tomados, estatus_laboral, lider_id
                ) VALUES ('denis@rdl.com.mx', 'Lic. Denis Ramos', 'ABOGADA_JR', 'Abogada Junior de Litigio', 'Legal & Talent RDL', 'DR', '+52 (55) 5482-9010', '2025-02-01', 'Tiempo Indeterminado', 'RDL-035', 'RAMD940612RD1', 12, 2, 'ACTIVO', ?)
            `, [demoUserId], function(insDenisErr) {
                if (!insDenisErr && this.lastID) {
                    setupDenis(this.lastID);
                }
            });
        }
    });
}

export default db;
