import sqlite3 from 'sqlite3';
import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

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
    const defaultDbPath = path.join(__dirname, '..', '..', 'falcont_hub.db');
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
                console.warn('⚠️ Aviso al aplicar esquema inicial (se continuará con migraciones):', err.message);
            } else {
                console.log('✅ Esquema FALCONT Despacho Contable verificado/creado');
            }
            runMigrations();
            seedFalcontData();
            seedDummyClientUser();
        });
    } else {
        runMigrations();
        seedFalcontData();
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

    // 2. Migración para usuarios (Ficha estilo Buk)
    db.all("PRAGMA table_info(usuarios)", [], (err, columns) => {
        if (!err && columns && columns.length > 0) {
            const colNames = columns.map(c => c.name);

            if (!colNames.includes('foto_perfil')) {
                db.run("ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT DEFAULT NULL", () => {});
            }
            if (!colNames.includes('telefono')) {
                db.run("ALTER TABLE usuarios ADD COLUMN telefono TEXT DEFAULT '+52 (55) 5500-0000'", () => {});
            }
            if (!colNames.includes('fecha_ingreso')) {
                db.run("ALTER TABLE usuarios ADD COLUMN fecha_ingreso DATE DEFAULT '2026-01-15'", () => {});
            }
            if (!colNames.includes('tipo_contrato')) {
                db.run("ALTER TABLE usuarios ADD COLUMN tipo_contrato TEXT DEFAULT 'Tiempo Indeterminado'", () => {});
            }
            if (!colNames.includes('numero_empleado')) {
                db.run("ALTER TABLE usuarios ADD COLUMN numero_empleado TEXT DEFAULT 'FLC-001'", () => {});
            }
            if (!colNames.includes('salario_base')) {
                db.run("ALTER TABLE usuarios ADD COLUMN salario_base TEXT DEFAULT 'Confidencial'", () => {});
            }
            if (!colNames.includes('estatus_laboral')) {
                db.run("ALTER TABLE usuarios ADD COLUMN estatus_laboral TEXT DEFAULT 'ACTIVO'", () => {});
            }

            if (!colNames.includes('rfc')) {
                db.run("ALTER TABLE usuarios ADD COLUMN rfc TEXT DEFAULT NULL", (alterErr) => {
                    if (!alterErr) {
                        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_rfc ON usuarios(rfc) WHERE rfc IS NOT NULL;");
                        db.run("CREATE INDEX IF NOT EXISTS idx_usuarios_rfc_email ON usuarios(rfc, email);");
                    }
                });
            }

            if (!colNames.includes('lider_id')) {
                db.run("ALTER TABLE usuarios ADD COLUMN lider_id INTEGER DEFAULT NULL", (alterErr) => {
                    if (!alterErr) {
                        db.run("CREATE INDEX IF NOT EXISTS idx_usuarios_lider ON usuarios(lider_id);");
                    }
                });
            }

            // 3. Tablas relacionales complementarias
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
            `, () => {
                db.run("CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);");
                db.run("CREATE INDEX IF NOT EXISTS idx_auth_tokens_usuario ON auth_tokens(usuario_id);");
            });

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
            `, () => {
                db.run("CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leido);");
            });

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
            `);

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
            `, () => {
                seedReportesPlantillas();
            });
        }
    });
}

function seedFalcontData() {
    db.get('SELECT COUNT(*) as count FROM usuarios', [], (err, row) => {
        if (!err && row && row.count === 0) {
            console.log('🌱 Poblando equipo contable inicial de FALCONT...');

            const insertUser = db.prepare(`
                INSERT OR IGNORE INTO usuarios (email, nombre, rol, puesto, departamento, avatar, telefono, fecha_ingreso, tipo_contrato, numero_empleado, rfc, dias_vacaciones_totales, dias_vacaciones_tomados)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // 1. Cliente Demo / Socio Director
            insertUser.run(
                'demo@falcont.com.mx', 'C.P.C. Carlos Mendoza (Cliente Demo)', 'ADMIN', 'Socio Director & Auditoría',
                'Dirección General & Auditoría', 'CM', '+52 (55) 5500-9099', '2023-01-15', 'Tiempo Indeterminado', 'FLC-DEMO', 'DEMO880101FLC', 20, 4
            );

            // 2. Dirección de Talento / RH
            insertUser.run(
                'rh@falcont.com.mx', 'Lic. Andrés Cosmes', 'RH', 'Dirección de Recursos Humanos & Talento',
                'Recursos Humanos', 'AC', '+52 (55) 5500-9000', '2023-01-01', 'Tiempo Indeterminado', 'FLC-RH01', 'COSR880101FLC', 25, 0
            );

            // 3. Gerente Fiscal & Auditoría (Senior)
            insertUser.run(
                'valeria.falcon@falcont.com.mx', 'C.P. Valeria Falcón', 'CONTADOR_SR', 'Gerente Fiscal & Auditoría',
                'Fiscal & Auditoría', 'VF', '+52 (55) 5500-9002', '2024-06-15', 'Tiempo Indeterminado', 'FLC-014', 'FALV920514FL1', 15, 3
            );

            // 4. Analista de Nóminas & Seguridad Social (Junior)
            insertUser.run(
                'denis.ramos@falcont.com.mx', 'C.P. Denis Ramos', 'CONTADOR_JR', 'Analista de Nóminas & Seguridad Social',
                'Nóminas & IMSS', 'DR', '+52 (55) 5500-9010', '2025-02-01', 'Tiempo Indeterminado', 'FLC-028', 'RAMD940612FL2', 12, 2
            );

            // 5. Auxiliar Contable & Conciliaciones (Junior)
            insertUser.run(
                'ana.martinez@falcont.com.mx', 'C.P. Ana Martínez', 'CONTADOR_JR', 'Auxiliar Contable & Conciliaciones',
                'Contabilidad General', 'AM', '+52 (55) 5500-9003', '2025-01-10', 'Tiempo Indeterminado', 'FLC-035', 'MARA950820FL3', 12, 1
            );

            // 6. Consultora de Talento Externa (Adelta)
            insertUser.run(
                'patricia.silva@adeltaconsultores.com', 'Lic. Patricia Silva', 'RH', 'Consultora de Talento & Auditoría Externa',
                'Auditoría & Consultoría Externa', 'PS', '+52 (55) 5500-9080', '2024-01-01', 'Tiempo Indeterminado', 'AD-007', 'SIP901105AD1', 20, 2
            );

            insertUser.finalize(() => {
                console.log('✅ Equipo contable de FALCONT registrado con éxito.');
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
            console.log('📢 Generando comunicados contables y fiscales para el Muro FALCONT...');
            
            const insertFeed = db.prepare(`
                INSERT INTO feed_publicaciones (autor_id, autor_nombre, autor_rol, autor_avatar, titulo, contenido, categoria, likes_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insertFeed.run(
                1, 'C.P.C. Carlos Mendoza', 'ADMIN', 'CM',
                '¡Bienvenidos a FALCONT Hub - Despacho Contable!',
                'Iniciamos oficialmente operaciones en nuestro nuevo portal institucional. Aquí compartiremos comunicados fiscales, avisos de Miscelánea Fiscal SAT, seguimiento de metas ponderadas (100%), directorio de colaboradores y control de vacaciones e incidencias.',
                'Corporativo', 6
            );

            insertFeed.run(
                3, 'C.P. Valeria Falcón', 'CONTADOR_SR', 'VF',
                'Calendario Fiscal y Cierre Mensual Octubre 2026',
                'Recordatorio para todo el equipo contable: El próximo 17 es la fecha límite para la presentación de pagos provisionales de ISR e IVA, así como el envío de la DIOT y balanzas de comprobación. Por favor conciliar timbrados CFDI 4.0 con anticipación.',
                'Aviso Fiscal', 4
            );

            insertFeed.run(
                4, 'C.P. Denis Ramos', 'CONTADOR_JR', 'DR',
                'Actualización de Factores de Descuento INFONAVIT & SUA',
                'Se han cargado las tablas de amortización y factores de descuento actualizados para la segunda quincena. Favor de revisar incidencias y pre-nóminas en el sistema contable.',
                'Contabilidad', 3
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

            // Metas para Analista de Nóminas (Denis Ramos - ID 4) - Suma: 40% + 35% + 25% = 100%
            insertMeta.run(
                4,
                'Procesamiento y Timbrado de Nóminas CFDI 4.0',
                'Revisión, cálculo y timbrado oportuno de nóminas quincenales y asimilados a salarios.',
                '100% de recibos timbrados en tiempo sin inconsistencias en el SAT',
                40.0,
                85.0,
                'Nominas',
                '2026-10-31',
                'EN_PROGRESO'
            );

            insertMeta.run(
                4,
                'Determinación de Cuotas Obrero-Patronales IMSS/SUA',
                'Cálculo mensual del SUA y generación de líneas de captura SIPARE sin diferencias.',
                'Cero multas, recargos o créditos fiscales emitidos por el IMSS',
                35.0,
                75.0,
                'Nominas',
                '2026-11-15',
                'EN_PROGRESO'
            );

            insertMeta.run(
                4,
                'Conciliación de CFDI de Nómina en Visor del SAT',
                'Cotejo mensual de acumulados de nómina vs Visor de Comprobantes de Nómina del SAT.',
                'Discrepancia fiscal menor al 0.01% al cierre de mes',
                25.0,
                90.0,
                'Fiscal',
                '2026-10-25',
                'EN_PROGRESO'
            );

            // Metas para Gerente Fiscal (Valeria Falcón - ID 3) - Suma: 50% + 50% = 100%
            insertMeta.run(
                3,
                'Supervisión y Dictamen de Cierres Fiscales Mensuales',
                'Validación técnica de declaraciones provisionales de ISR, IVA y retenciones de personas morales.',
                '100% de declaraciones validadas y enviadas antes del día 17',
                50.0,
                80.0,
                'Fiscal',
                '2026-10-31',
                'EN_PROGRESO'
            );

            insertMeta.run(
                3,
                'Capacitación y Actualización en Reformas SAT 2026',
                'Sesiones técnicas para el equipo en materia de Carta Porte, Complemento Pagos 2.0 y REPSE.',
                '4 talleres completados con evaluación de comprensión ≥ 9.0',
                50.0,
                70.0,
                'Capacitacion',
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
            console.log('📊 Sembrando plantillas de reportes estándar para FALCONT...');
            const plantillas = [
                {
                    nombre: 'Plantilla Ficha Integral de Personal Contable (Buk)',
                    descripcion: 'Expediente general del colaborador: puesto, contacto, RFC, contrato, antigüedad y líder.',
                    categoria: 'COLABORADORES',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'rfc', 'email', 'puesto', 'departamento', 'telefono', 'fecha_ingreso', 'antiguedad', 'tipo_contrato', 'estatus_laboral', 'lider_nombre', 'salario_base', 'rol']),
                    es_sistema: 1
                },
                {
                    nombre: 'Plantilla Auditoría de Vacaciones & Permisos (Control de Incidencias)',
                    descripcion: 'Historial completo de ausencias, permisos por hora y día, fechas, horarios, motivos, líderes y estatus de aprobación.',
                    categoria: 'INCIDENCIAS',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'rfc', 'puesto', 'departamento', 'inc_tipo', 'inc_subtipo', 'inc_fecha_inicio', 'inc_fecha_fin', 'inc_horario', 'inc_horas', 'inc_dias', 'inc_motivo', 'inc_estatus', 'inc_lider', 'inc_fecha_solicitud', 'vac_disponibles']),
                    es_sistema: 1
                },
                {
                    nombre: 'Plantilla Evaluación de Desempeño y Metas Fiscales (100%)',
                    descripcion: 'Seguimiento de metas ponderadas, avance porcentual, categorías, indicadores y fechas límite.',
                    categoria: 'METAS',
                    campos: JSON.stringify(['numero_empleado', 'nombre', 'puesto', 'departamento', 'lider_nombre', 'meta_titulo', 'meta_descripcion', 'meta_indicador', 'meta_peso', 'meta_avance', 'meta_categoria', 'meta_fecha_limite', 'meta_estatus', 'meta_fecha_creacion']),
                    es_sistema: 1
                },
                {
                    nombre: 'Consolidado Maestro Despacho Contable FALCONT',
                    descripcion: 'Visión 360° combinando expediente contable, saldo de vacaciones y balance de metas ponderadas.',
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
                stmt.run(p.nombre, p.descripcion, p.categoria, p.campos, 'Sistema FALCONT', p.es_sistema);
            });

            stmt.finalize(() => {
                console.log('✅ Plantillas de reportes contables inicializadas con éxito.');
            });
        }
    });
}

// Garantizar usuario Dummy para Evaluación de Clientes (Acceso Total 360°)
export function seedDummyClientUser() {
    const demoEmail = 'demo@falcont.com.mx';
    const demoRfc = 'DEMO880101FLC';

    db.get("SELECT id, email, rfc FROM usuarios WHERE LOWER(email) = LOWER(?) OR UPPER(rfc) = UPPER(?) LIMIT 1", [demoEmail, demoRfc], (err, user) => {
        if (!err && !user) {
            console.log("🌱 Creando usuario Dummy para Evaluación de Clientes FALCONT...");
            db.run(`
                INSERT OR IGNORE INTO usuarios (
                    email, nombre, rol, puesto, departamento, avatar, telefono,
                    fecha_ingreso, tipo_contrato, numero_empleado, rfc,
                    dias_vacaciones_totales, dias_vacaciones_tomados, estatus_laboral, lider_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', NULL)
            `, [
                demoEmail,
                'C.P.C. Carlos Mendoza (Cliente Demo)',
                'ADMIN',
                'Socio Director & Auditoría (Demo 360°)',
                'Dirección General & Auditoría',
                'CM',
                '+52 (55) 5500-9099',
                '2023-01-15',
                'Tiempo Indeterminado',
                'FLC-DEMO',
                demoRfc,
                20,
                4
            ], function(insertErr) {
                if (!insertErr) {
                    const demoUserId = this.lastID;
                    console.log(`✅ Usuario Demo creado con ID: ${demoUserId}`);
                    seedDemoGoalsAndIncidencias(demoUserId);
                } else {
                    console.error("❌ Error al crear usuario demo:", insertErr.message);
                }
            });
        } else if (user) {
            const demoUserId = user.id;
            db.run(`
                UPDATE usuarios 
                SET rol = 'ADMIN', rfc = ?, estatus_laboral = 'ACTIVO',
                    nombre = 'C.P.C. Carlos Mendoza (Cliente Demo)',
                    puesto = 'Socio Director & Auditoría (Demo 360°)',
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

                // Meta 1 (40%): Cierre Fiscal Mensual & Declaraciones SAT
                insertMeta.run(
                    demoUserId,
                    'Cierre Fiscal Mensual & Declaraciones SAT',
                    'Supervisión y auditoría del cumplimiento de pagos provisionales y definitivos de clientes.',
                    '100% de declaraciones presentadas oportunamente sin multas ni recargos',
                    40.0,
                    85.0,
                    'Fiscal',
                    '2026-10-31',
                    'EN_PROGRESO'
                );

                // Meta 2 (35%): Auditoría y Conciliación de CFDI 4.0 vs Balanza
                insertMeta.run(
                    demoUserId,
                    'Auditoría y Conciliación de CFDI 4.0 vs Balanza',
                    'Cotejo analítico entre facturación emitida/recibida y registros contables en sistema.',
                    '0 discrepancias entre CFDI timbrados y balanzas de comprobación',
                    35.0,
                    70.0,
                    'Auditoria',
                    '2026-11-15',
                    'EN_PROGRESO'
                );

                // Meta 3 (25%): Timbrado y Dispersión de Nómina e IMSS
                insertMeta.run(
                    demoUserId,
                    'Timbrado y Dispersión de Nómina e IMSS',
                    'Garantizar la exactitud de recibos de nómina y liquidación oportuna de cuotas obrero-patronales.',
                    'Emisión de nóminas y generación SUA/SIPARE al 100% en tiempo',
                    25.0,
                    90.0,
                    'Nominas',
                    '2026-12-15',
                    'EN_PROGRESO'
                );

                insertMeta.finalize(() => {
                    console.log("✅ Metas ponderadas (100%) registradas para usuario Demo de FALCONT.");
                });
            });
        }
    });

    // 2. Notificaciones en Tiempo Real para el usuario Demo
    db.get("SELECT COUNT(*) as count FROM notificaciones WHERE usuario_id = ?", [demoUserId], (notifErr, nRow) => {
        const notifCount = nRow ? nRow.count : 0;
        if (!notifErr && notifCount < 2) {
            console.log(`🔔 Sembrando notificaciones para usuario Demo ID ${demoUserId}...`);
            db.run("DELETE FROM notificaciones WHERE usuario_id = ?", [demoUserId], () => {
                const insertNotif = db.prepare(`
                    INSERT INTO notificaciones (usuario_id, remitente_id, remitente_nombre, remitente_avatar, tipo, titulo, mensaje, leido)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                insertNotif.run(
                    demoUserId,
                    4,
                    'C.P. Denis Ramos',
                    'DR',
                    'INCIDENCIA_SOLICITUD',
                    'Nueva Solicitud de Permiso por Día',
                    'C.P. Denis Ramos ha solicitado un Permiso por día (con goce de sueldo) para el 2026-10-05.',
                    0
                );

                insertNotif.run(
                    demoUserId,
                    2,
                    'Dirección de Talento FALCONT',
                    'AC',
                    'SISTEMA',
                    '¡Bienvenido a FALCONT Hub!',
                    'Tu perfil cuenta con privilegios de Administrador para evaluar todos los módulos: Muro, Reportes Excel, Fichas Buk y Metas Ponderadas.',
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
        db.run("UPDATE usuarios SET lider_id = ?, rfc = COALESCE(rfc, 'RAMD940612FL2') WHERE id = ?", [demoUserId, denisId], () => {
            db.run("UPDATE incidencias_vacaciones SET lider_id = ? WHERE usuario_id = ? AND estatus = 'PENDIENTE'", [demoUserId, denisId], () => {
                db.get("SELECT COUNT(*) as count FROM incidencias_vacaciones WHERE lider_id = ? AND estatus = 'PENDIENTE'", [demoUserId], (incErr, incRow) => {
                    if (!incErr && (!incRow || incRow.count === 0)) {
                        console.log("✈️ Creando incidencias contables para evaluar módulo de Aprobación...");
                        const insertInc = db.prepare(`
                            INSERT INTO incidencias_vacaciones (
                                usuario_id, usuario_nombre, usuario_rol, tipo, subtipo,
                                fecha_inicio, fecha_fin, hora_inicio, hora_fin, horas_solicitadas,
                                dias_solicitados, motivo, estatus, lider_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);

                        insertInc.run(
                            denisId,
                            'C.P. Denis Ramos',
                            'CONTADOR_JR',
                            'Permiso',
                            'DIA_CON_GOCE',
                            '2026-10-05',
                            '2026-10-05',
                            null,
                            null,
                            0,
                            1,
                            'Trámite presencial urgente ante Secretaría de Finanzas y SAT para entrega de aclaración fiscal.',
                            'PENDIENTE',
                            demoUserId
                        );

                        insertInc.run(
                            denisId,
                            'C.P. Denis Ramos',
                            'CONTADOR_JR',
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
                            console.log("✅ Incidencias pendientes creadas para autorizar por el usuario Demo.");
                        });
                    }
                });
            });
        });
    };

    const checkAndSetupDenis = () => {
        db.get("SELECT id, nombre, email FROM usuarios WHERE LOWER(email) = 'denis.ramos@falcont.com.mx' LIMIT 1", [], (denisErr, denis) => {
            if (!denisErr && denis) {
                setupDenis(denis.id);
            }
        });
    };

    checkAndSetupDenis();
    setTimeout(checkAndSetupDenis, 1200);
}

export default db;
