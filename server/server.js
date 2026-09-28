import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import { verificarJwt } from './services/auth.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 9060;

// Soporte para Render y balanceadores de carga / proxies HTTPS
app.set('trust proxy', 1);

// ============================================================
// CIBERSEGURIDAD: OWASP HEADERS & PROTECCIÓN DE INFRAESTRUCTURA
// ============================================================
app.disable('x-powered-by');

app.use((req, res, next) => {
    // 1. Prevenir ataques de clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // 2. Prevenir MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 3. Forzar HTTPS estricto (HSTS) en producción / proxies SSL
    const isHttps = req.secure || (req.headers['x-forwarded-proto'] === 'https');
    if (isHttps) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // 4. Política de referencias (previene fuga de tokens en URL)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 5. Restricción de permisos y APIs del hardware cliente
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // 6. Content Security Policy (compatible con Astro, GSAP, Google Fonts y WebSockets)
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
        "font-src 'self' https://fonts.gstatic.com data:; " +
        "img-src 'self' data: blob: https:; " +
        "connect-src 'self' wss: ws: https: http:; " +
        "frame-ancestors 'self';"
    );

    next();
});

app.use(cookieParser());
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

// Soporte para JSON y fotos de perfil en Base64 hasta 50MB
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos del bundle de Astro (dist) y assets (public)
const distPath = path.join(__dirname, '..', 'dist');
const publicPath = path.join(__dirname, '..', 'public');

app.use(express.static(distPath, { index: false }));
app.use(express.static(publicPath, { index: false }));

// Montar rutas de autenticación Magic Link
app.use('/api/auth', authRoutes);

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                ips.push(alias.address);
            }
        }
    }
    return ips;
}

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ============================================================
// ENDPOINTS REST
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        app: 'RDL Intelligence Hub (Astro + Floating-UI Engine)',
        port: PORT,
        localIPs: getLocalIPs(),
        timestamp: new Date().toISOString()
    });
});

// 1. USUARIOS & FICHA DE PERFIL ESTILO BUK
app.get('/api/usuarios', (req, res) => {
    const query = `
        SELECT u.*, 
        (SELECT nombre FROM usuarios WHERE id = u.lider_id) as lider_nombre,
        (u.dias_vacaciones_totales - u.dias_vacaciones_tomados) as dias_vacaciones_restantes,
        (SELECT COUNT(*) FROM metas_empleado WHERE usuario_id = u.id) as total_metas
        FROM usuarios u
        ORDER BY u.id ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: rows });
    });
});

// 1.1 BUSCADOR DE COLABORADORES EN TIEMPO REAL (ESTILO BUK)
app.get('/api/colaboradores/search', (req, res) => {
    const queryTerm = (req.query.q || '').trim();
    let sql = `
        SELECT u.id, u.nombre, u.email, u.rol, u.puesto, u.departamento, u.avatar, u.foto_perfil, u.telefono,
               u.fecha_ingreso, u.tipo_contrato, u.numero_empleado, u.estatus_laboral, u.rfc, u.lider_id,
               (SELECT nombre FROM usuarios WHERE id = u.lider_id) as lider_nombre,
               u.dias_vacaciones_totales, u.dias_vacaciones_tomados,
               (u.dias_vacaciones_totales - u.dias_vacaciones_tomados) as dias_vacaciones_restantes
        FROM usuarios u
    `;
    let params = [];

    if (queryTerm) {
        sql += ` WHERE u.nombre LIKE ? OR u.puesto LIKE ? OR u.departamento LIKE ? OR u.email LIKE ? OR u.numero_empleado LIKE ?`;
        const wild = `%${queryTerm}%`;
        params = [wild, wild, wild, wild, wild];
    }
    sql += ` ORDER BY u.nombre ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const users = rows || [];
        if (users.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Obtener metas y estadísticas de desempeño para cada colaborador
        db.all('SELECT usuario_id, peso, porcentaje_avance FROM metas_empleado', [], (err, allMetas) => {
            const metasMap = {};
            (allMetas || []).forEach(m => {
                if (!metasMap[m.usuario_id]) metasMap[m.usuario_id] = [];
                metasMap[m.usuario_id].push(m);
            });

            const enriched = users.map(user => {
                const userMetas = metasMap[user.id] || [];
                const suma_pesos = userMetas.reduce((acc, m) => acc + (parseFloat(m.peso) || 0), 0);
                let avance_ponderado = 0;
                if (userMetas.length > 0) {
                    avance_ponderado = userMetas.reduce((acc, m) => {
                        const p = parseFloat(m.peso) || 0;
                        const a = parseFloat(m.porcentaje_avance) || 0;
                        return acc + (a * p / 100);
                    }, 0);
                }

                return {
                    ...user,
                    total_metas: userMetas.length,
                    suma_pesos: Math.round(suma_pesos * 100) / 100,
                    desempeno_global: Math.round(avance_ponderado * 100) / 100,
                    ponderacion_completa: Math.abs(suma_pesos - 100) < 0.5
                };
            });

            res.json({ success: true, data: enriched });
        });
    });
});

// 1.2 OBTENER FICHA COMPLETA DE COLABORADOR POR ID (ESTILO BUK)
app.get('/api/colaboradores/:id', (req, res) => {
    const userId = req.params.id;
    db.get(`
        SELECT u.*, 
               (SELECT nombre FROM usuarios WHERE id = u.lider_id) as lider_nombre,
               (dias_vacaciones_totales - dias_vacaciones_tomados) as dias_vacaciones_restantes 
        FROM usuarios u 
        WHERE u.id = ?
    `, [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Colaborador no encontrado' });

        db.all('SELECT * FROM metas_empleado WHERE usuario_id = ? ORDER BY id ASC', [userId], (err, metas) => {
            const userMetas = metas || [];
            const suma_pesos = userMetas.reduce((acc, m) => acc + (parseFloat(m.peso) || 0), 0);
            let avance_ponderado = 0;
            if (userMetas.length > 0) {
                avance_ponderado = userMetas.reduce((acc, m) => {
                    const p = parseFloat(m.peso) || 0;
                    const a = parseFloat(m.porcentaje_avance) || 0;
                    return acc + (a * p / 100);
                }, 0);
            }

            db.all(`
                SELECT i.*, 
                       (SELECT nombre FROM usuarios WHERE id = i.lider_id) as lider_nombre
                FROM incidencias_vacaciones i 
                WHERE i.usuario_id = ? 
                ORDER BY i.fecha_solicitud DESC
            `, [userId], (err, incidencias) => {
                res.json({
                    success: true,
                    data: {
                        perfil: user,
                        metas: userMetas,
                        stats: {
                            total_metas: userMetas.length,
                            suma_pesos: Math.round(suma_pesos * 100) / 100,
                            avance_ponderado_global: Math.round(avance_ponderado * 100) / 100,
                            ponderacion_completa: Math.abs(suma_pesos - 100) < 0.5
                        },
                        incidencias: incidencias || []
                    }
                });
            });
        });
    });
});

// 1.3 ACTUALIZAR DATOS GENERALES DE COLABORADOR (FICHA BUK)
app.put('/api/colaboradores/:id', (req, res) => {
    const userId = req.params.id;
    const { nombre, puesto, departamento, telefono, fecha_ingreso, tipo_contrato, numero_empleado, salario_base, estatus_laboral, rfc, lider_id } = req.body;

    db.get('SELECT * FROM usuarios WHERE id = ?', [userId], (err, existing) => {
        if (err || !existing) return res.status(404).json({ error: 'Colaborador no encontrado' });

        const updatedNombre = nombre || existing.nombre;
        const updatedPuesto = puesto || existing.puesto;
        const updatedDept = departamento || existing.departamento;
        const updatedTel = telefono !== undefined ? telefono : existing.telefono;
        const updatedFecha = fecha_ingreso || existing.fecha_ingreso;
        const updatedContrato = tipo_contrato || existing.tipo_contrato;
        const updatedNumEmp = numero_empleado || existing.numero_empleado;
        const updatedSalario = salario_base || existing.salario_base;
        const updatedEstatus = estatus_laboral || existing.estatus_laboral;
        const updatedRfc = rfc !== undefined ? (rfc ? rfc.trim().toUpperCase() : null) : existing.rfc;
        const updatedLider = lider_id !== undefined ? (lider_id ? parseInt(lider_id, 10) : null) : existing.lider_id;

        const avatarTxt = updatedNombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        db.run(`
            UPDATE usuarios 
            SET nombre = ?, puesto = ?, departamento = ?, avatar = ?, telefono = ?, fecha_ingreso = ?, tipo_contrato = ?, numero_empleado = ?, salario_base = ?, estatus_laboral = ?, rfc = ?, lider_id = ?
            WHERE id = ?
        `, [updatedNombre, updatedPuesto, updatedDept, avatarTxt, updatedTel, updatedFecha, updatedContrato, updatedNumEmp, updatedSalario, updatedEstatus, updatedRfc, updatedLider, userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            db.get(`
                SELECT u.*, 
                       (SELECT nombre FROM usuarios WHERE id = u.lider_id) as lider_nombre,
                       (dias_vacaciones_totales - dias_vacaciones_tomados) as dias_vacaciones_restantes 
                FROM usuarios u 
                WHERE u.id = ?
            `, [userId], (err, updatedUser) => {
                io.emit('usuario:perfil_actualizado', updatedUser);
                res.json({ success: true, data: updatedUser });
            });
        });
    });
});

// 1.4 SUBIR / ACTUALIZAR FOTO DE PERFIL (BASE64 O URL)
app.post('/api/colaboradores/:id/foto', (req, res) => {
    const userId = req.params.id;
    const { foto_perfil } = req.body;

    if (!foto_perfil) {
        return res.status(400).json({ error: 'No se envió ninguna foto de perfil.' });
    }

    db.run('UPDATE usuarios SET foto_perfil = ? WHERE id = ?', [foto_perfil, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        db.get('SELECT *, (dias_vacaciones_totales - dias_vacaciones_tomados) as dias_vacaciones_restantes FROM usuarios WHERE id = ?', [userId], (err, updatedUser) => {
            io.emit('usuario:perfil_actualizado', updatedUser);
            res.json({ success: true, data: updatedUser });
        });
    });
});

app.post('/api/usuarios', (req, res) => {
    const { nombre, rol, puesto, email, dias_vacaciones_totales, telefono, fecha_ingreso, tipo_contrato, numero_empleado } = req.body;
    if (!nombre || !rol || !email) {
        return res.status(400).json({ error: 'Nombre, rol y correo electrónico son requeridos.' });
    }

    const avatarTxt = nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    const stmt = db.prepare(`
        INSERT INTO usuarios (email, nombre, rol, puesto, departamento, avatar, telefono, fecha_ingreso, tipo_contrato, numero_empleado, dias_vacaciones_totales, dias_vacaciones_tomados)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run([
        email, nombre, rol, puesto || 'Colaboradora RDL', 'Legal & Talent', avatarTxt,
        telefono || '+52 (55) 5482-9000', fecha_ingreso || '2026-01-15', tipo_contrato || 'Tiempo Indeterminado',
        numero_empleado || `RDL-0${Math.floor(Math.random() * 90) + 10}`,
        dias_vacaciones_totales || 12
    ], function (err) {
        if (err) {
            return res.status(500).json({ error: 'El usuario ya existe o error en base de datos: ' + err.message });
        }

        const nuevoUsuario = {
            id: this.lastID,
            email,
            nombre,
            rol,
            puesto: puesto || 'Colaboradora RDL',
            departamento: 'Legal & Talent',
            avatar: avatarTxt,
            telefono: telefono || '+52 (55) 5482-9000',
            fecha_ingreso: fecha_ingreso || '2026-01-15',
            tipo_contrato: tipo_contrato || 'Tiempo Indeterminado',
            numero_empleado: numero_empleado || 'RDL-099',
            dias_vacaciones_totales: dias_vacaciones_totales || 12,
            dias_vacaciones_tomados: 0,
            dias_vacaciones_restantes: dias_vacaciones_totales || 12
        };

        // Insertar metas por defecto con ponderación de 100%
        db.run(`
            INSERT INTO metas_empleado (usuario_id, titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            this.lastID,
            'Integración de Expedientes Iniciales',
            'Verificar y completar la documentación de ingreso de nuevos colaboradores.',
            '100% de expedientes validados y archivados',
            50.0,
            60.0,
            'Caso Legal',
            '2026-10-31',
            'EN_PROGRESO'
        ], () => {
            db.run(`
                INSERT INTO metas_empleado (usuario_id, titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                this.lastID,
                'Capacitación y Cumplimiento Normativo',
                'Acreditación en protocolos legales internos y NOMs aplicables.',
                'Aprobación de módulos de inducción RDL',
                50.0,
                80.0,
                'Capacitación',
                '2026-11-15',
                'EN_PROGRESO'
            ]);
        });

        io.emit('usuario:creado', nuevoUsuario);
        res.json({ success: true, data: nuevoUsuario });
    });
});

// Endpoint legacy /api/login deshabilitado por seguridad corporativa
app.post('/api/login', (req, res) => {
    return res.status(403).json({
        success: false,
        error: 'El inicio de sesión directo ha sido reemplazado por la autenticación segura sin contraseña vía Magic Link institucional.'
    });
});

// 2. MURO ESTILO FACEBOOK (FEED)
app.get('/api/feed', (req, res) => {
    let usuarioId = req.query.usuario_id;
    if (!usuarioId) {
        const token = (req.cookies && req.cookies.rdl_session) || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (token) {
            const decoded = verificarJwt(token);
            if (decoded) usuarioId = decoded.id;
        }
    }
    const userIdNum = usuarioId ? parseInt(usuarioId, 10) : 0;

    const query = `
        SELECT f.*, 
        (SELECT COUNT(*) FROM feed_comentarios WHERE publicacion_id = f.id) as comentarios_count,
        (SELECT COUNT(*) FROM feed_likes WHERE publicacion_id = f.id AND usuario_id = ?) as user_has_liked
        FROM feed_publicaciones f 
        ORDER BY f.fecha_creacion DESC
    `;
    db.all(query, [userIdNum], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/feed', (req, res) => {
    const { autor_id, autor_nombre, autor_rol, autor_avatar, titulo, contenido, categoria, imagen_url } = req.body;

    if (autor_rol !== 'ADMIN' && autor_rol !== 'ABOGADA_SR' && autor_rol !== 'RH' && autor_rol !== 'ADMIN_RH') {
        return res.status(403).json({ error: 'Permisos insuficientes. Solo Administradores, Abogadas SR y Recursos Humanos pueden publicar.' });
    }

    const stmt = db.prepare(`
        INSERT INTO feed_publicaciones (autor_id, autor_nombre, autor_rol, autor_avatar, titulo, contenido, categoria, imagen_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([autor_id, autor_nombre, autor_rol, autor_avatar || 'RDL', titulo || '', contenido, categoria || 'Corporativo', imagen_url || null], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const nuevoPost = {
            id: this.lastID,
            autor_id, autor_nombre, autor_rol, autor_avatar, titulo, contenido, categoria, imagen_url: imagen_url || null,
            likes_count: 0, comentarios_count: 0, fecha_creacion: new Date().toISOString()
        };

        io.emit('feed:nuevo_post', nuevoPost);
        res.json({ success: true, data: nuevoPost });
    });
});

// Reacción en Muro con Control Estricto de 1 solo Like por usuario (Toggle On/Off)
app.post('/api/feed/:id/like', (req, res) => {
    const postID = req.params.id;
    let usuarioId = req.body && req.body.usuario_id;

    if (!usuarioId) {
        const token = (req.cookies && req.cookies.rdl_session) || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (token) {
            const decoded = verificarJwt(token);
            if (decoded) usuarioId = decoded.id;
        }
    }

    if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'Debes iniciar sesión para reaccionar a esta publicación.' });
    }

    usuarioId = parseInt(usuarioId, 10);

    // Verificar si el usuario ya dio like previamente a esta publicación
    db.get('SELECT id FROM feed_likes WHERE publicacion_id = ? AND usuario_id = ? LIMIT 1', [postID, usuarioId], (checkErr, existingLike) => {
        if (checkErr) return res.status(500).json({ error: checkErr.message });

        if (existingLike) {
            // Ya dio like: retirar reacción (toggle off, decremento en 1 sin pasar de 0)
            db.run('DELETE FROM feed_likes WHERE id = ?', [existingLike.id], function (delErr) {
                if (delErr) return res.status(500).json({ error: delErr.message });

                db.run('UPDATE feed_publicaciones SET likes_count = MAX(0, likes_count - 1) WHERE id = ?', [postID], function (updateErr) {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });

                    db.get('SELECT id, likes_count FROM feed_publicaciones WHERE id = ?', [postID], (err, row) => {
                        const updated = row || { id: parseInt(postID, 10), likes_count: 0 };
                        io.emit('feed:like_actualizado', { id: parseInt(postID, 10), likes_count: updated.likes_count, liked: false, usuario_id: usuarioId });
                        res.json({ success: true, liked: false, data: updated });
                    });
                });
            });
        } else {
            // No ha dado like: registrar nuevo like (toggle on, exactamente 1 like)
            db.run('INSERT INTO feed_likes (publicacion_id, usuario_id) VALUES (?, ?)', [postID, usuarioId], function (insErr) {
                if (insErr) return res.status(500).json({ error: insErr.message });

                db.run('UPDATE feed_publicaciones SET likes_count = likes_count + 1 WHERE id = ?', [postID], function (updateErr) {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });

                    db.get('SELECT id, likes_count FROM feed_publicaciones WHERE id = ?', [postID], (err, row) => {
                        const updated = row || { id: parseInt(postID, 10), likes_count: 1 };
                        io.emit('feed:like_actualizado', { id: parseInt(postID, 10), likes_count: updated.likes_count, liked: true, usuario_id: usuarioId });
                        res.json({ success: true, liked: true, data: updated });
                    });
                });
            });
        }
    });
});

// 3. MÓDULO DE METAS PONDERADAS (PESOS = 100%, INDICADORES, AVANCE)
app.get('/api/metas/:usuario_id', (req, res) => {
    const usuarioId = req.params.usuario_id;
    db.all('SELECT * FROM metas_empleado WHERE usuario_id = ? ORDER BY id ASC', [usuarioId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const metas = rows || [];
        const suma_pesos = metas.reduce((acc, m) => acc + (parseFloat(m.peso) || 0), 0);
        let avance_ponderado = 0;
        if (metas.length > 0) {
            avance_ponderado = metas.reduce((acc, m) => {
                const p = parseFloat(m.peso) || 0;
                const a = parseFloat(m.porcentaje_avance) || 0;
                return acc + (a * p / 100);
            }, 0);
        }
        const ponderacion_completa = Math.abs(suma_pesos - 100) < 0.5;

        res.json({
            success: true,
            data: metas,
            stats: {
                total_metas: metas.length,
                suma_pesos: Math.round(suma_pesos * 100) / 100,
                avance_ponderado_global: Math.round(avance_ponderado * 100) / 100,
                ponderacion_completa
            }
        });
    });
});

app.post('/api/metas', (req, res) => {
    const { usuario_id, titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus } = req.body;

    if (!usuario_id || !titulo) {
        return res.status(400).json({ error: 'El ID de usuario y el título de la meta son obligatorios.' });
    }

    const stmt = db.prepare(`
        INSERT INTO metas_empleado (usuario_id, titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
        usuario_id,
        titulo,
        descripcion || '',
        indicador || 'Cumplimiento de objetivos',
        parseFloat(peso) || 25.0,
        parseFloat(porcentaje_avance) || 0.0,
        categoria || 'Caso Legal',
        fecha_limite || '2026-12-31',
        estatus || 'EN_PROGRESO'
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const nuevaMeta = {
            id: this.lastID,
            usuario_id,
            titulo,
            descripcion: descripcion || '',
            indicador: indicador || 'Cumplimiento de objetivos',
            peso: parseFloat(peso) || 25.0,
            porcentaje_avance: parseFloat(porcentaje_avance) || 0.0,
            categoria: categoria || 'Caso Legal',
            fecha_limite: fecha_limite || '2026-12-31',
            estatus: estatus || 'EN_PROGRESO'
        };

        io.emit('metas:actualizadas', { usuario_id, action: 'create', meta: nuevaMeta });
        res.json({ success: true, data: nuevaMeta });
    });
});

app.put('/api/metas/:id', (req, res) => {
    const metaId = req.params.id;
    const { titulo, descripcion, indicador, peso, porcentaje_avance, categoria, fecha_limite, estatus } = req.body;

    db.get('SELECT * FROM metas_empleado WHERE id = ?', [metaId], (err, existing) => {
        if (err || !existing) return res.status(404).json({ error: 'Meta no encontrada.' });

        const updatedTitulo = titulo !== undefined ? titulo : existing.titulo;
        const updatedDesc = descripcion !== undefined ? descripcion : existing.descripcion;
        const updatedIndicador = indicador !== undefined ? indicador : existing.indicador;
        const updatedPeso = peso !== undefined ? parseFloat(peso) : existing.peso;
        const updatedAvance = porcentaje_avance !== undefined ? parseFloat(porcentaje_avance) : existing.porcentaje_avance;
        const updatedCat = categoria !== undefined ? categoria : existing.categoria;
        const updatedFecha = fecha_limite !== undefined ? fecha_limite : existing.fecha_limite;
        const updatedEstatus = estatus !== undefined ? estatus : existing.estatus;

        db.run(`
            UPDATE metas_empleado 
            SET titulo = ?, descripcion = ?, indicador = ?, peso = ?, porcentaje_avance = ?, categoria = ?, fecha_limite = ?, estatus = ?
            WHERE id = ?
        `, [updatedTitulo, updatedDesc, updatedIndicador, updatedPeso, updatedAvance, updatedCat, updatedFecha, updatedEstatus, metaId], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const updatedMeta = {
                id: parseInt(metaId, 10),
                usuario_id: existing.usuario_id,
                titulo: updatedTitulo,
                descripcion: updatedDesc,
                indicador: updatedIndicador,
                peso: updatedPeso,
                porcentaje_avance: updatedAvance,
                categoria: updatedCat,
                fecha_limite: updatedFecha,
                estatus: updatedEstatus
            };

            io.emit('metas:actualizadas', { usuario_id: existing.usuario_id, action: 'update', meta: updatedMeta });
            res.json({ success: true, data: updatedMeta });
        });
    });
});

app.delete('/api/metas/:id', (req, res) => {
    const metaId = req.params.id;

    db.get('SELECT * FROM metas_empleado WHERE id = ?', [metaId], (err, existing) => {
        if (err || !existing) return res.status(404).json({ error: 'Meta no encontrada.' });

        db.run('DELETE FROM metas_empleado WHERE id = ?', [metaId], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            io.emit('metas:actualizadas', { usuario_id: existing.usuario_id, action: 'delete', meta_id: metaId });
            res.json({ success: true, message: 'Meta eliminada con éxito.' });
        });
    });
});

app.post('/api/metas/:id/avance', (req, res) => {
    const metaId = req.params.id;
    const { porcentaje_avance } = req.body;

    db.get('SELECT * FROM metas_empleado WHERE id = ?', [metaId], (err, existing) => {
        if (err || !existing) return res.status(404).json({ error: 'Meta no encontrada.' });

        const avance = Math.min(100, Math.max(0, parseFloat(porcentaje_avance) || 0));
        let estatus = existing.estatus;
        if (avance >= 100) estatus = 'COMPLETADO';
        else if (avance > 0 && estatus === 'COMPLETADO') estatus = 'EN_PROGRESO';

        db.run('UPDATE metas_empleado SET porcentaje_avance = ?, estatus = ? WHERE id = ?', [avance, estatus, metaId], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const updatedMeta = { ...existing, porcentaje_avance: avance, estatus };
            io.emit('metas:actualizadas', { usuario_id: existing.usuario_id, action: 'avance', meta: updatedMeta });
            res.json({ success: true, data: updatedMeta });
        });
    });
});

// 4. INCIDENCIAS, VACACIONES Y PERMISOS DE AUSENCIA
app.get('/api/incidencias', (req, res) => {
    const query = `
        SELECT i.*, 
               (SELECT nombre FROM usuarios WHERE id = i.lider_id) as lider_nombre
        FROM incidencias_vacaciones i 
        ORDER BY i.fecha_solicitud DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/incidencias', (req, res) => {
    const {
        usuario_id, usuario_nombre, usuario_rol,
        tipo, subtipo, fecha_inicio, fecha_fin,
        hora_inicio, hora_fin, horas_solicitadas,
        dias_solicitados, motivo, lider_id
    } = req.body;

    if (!usuario_id || !motivo) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para la solicitud.' });
    }

    // Buscar información del colaborador para saber su líder directo asignado
    db.get('SELECT id, nombre, rol, avatar, lider_id, dias_vacaciones_totales, dias_vacaciones_tomados FROM usuarios WHERE id = ?', [usuario_id], (uErr, user) => {
        if (uErr || !user) {
            return res.status(404).json({ error: 'Colaborador solicitante no encontrado.' });
        }

        const saldoRestante = (user.dias_vacaciones_totales || 0) - (user.dias_vacaciones_tomados || 0);
        const diasNum = parseFloat(dias_solicitados) || 1;
        const horasNum = parseFloat(horas_solicitadas) || 0;
        const tipoFinal = tipo === 'Vacaciones' ? 'Vacaciones' : 'Permiso Especial';
        const subtipoFinal = subtipo || (tipoFinal === 'Vacaciones' ? 'VACACIONES' : 'DIA_CON_GOCE');

        if (tipoFinal === 'Vacaciones' && diasNum > saldoRestante) {
            return res.status(400).json({
                error: `Saldo insuficiente de vacaciones. Tienes ${saldoRestante} días disponibles y solicitaste ${diasNum}.`
            });
        }

        // Determinar líder destinatario: lider_id enviado > lider_id del usuario > Dirección RH
        const determineLeader = (callback) => {
            const explicitLeader = lider_id || user.lider_id;
            if (explicitLeader) {
                db.get('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?', [explicitLeader], (err, lead) => {
                    if (lead) return callback(lead);
                    db.get("SELECT id, nombre, email, rol FROM usuarios WHERE rol = 'RH' OR rol = 'ADMIN_RH' OR rol = 'ADMIN' ORDER BY id ASC LIMIT 1", [], (err2, rhLead) => {
                        callback(rhLead || null);
                    });
                });
            } else {
                db.get("SELECT id, nombre, email, rol FROM usuarios WHERE rol = 'RH' OR rol = 'ADMIN_RH' OR rol = 'ADMIN' ORDER BY id ASC LIMIT 1", [], (err, rhLead) => {
                    callback(rhLead || null);
                });
            }
        };

        determineLeader((leader) => {
            const targetLeaderId = leader ? leader.id : null;
            const targetLeaderName = leader ? leader.nombre : 'Dirección General / RH';

            const insertSql = `
                INSERT INTO incidencias_vacaciones (
                    usuario_id, usuario_nombre, usuario_rol, tipo, subtipo,
                    fecha_inicio, fecha_fin, hora_inicio, hora_fin, horas_solicitadas,
                    dias_solicitados, motivo, lider_id, estatus
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
            `;

            db.run(insertSql, [
                usuario_id,
                user.nombre || usuario_nombre,
                user.rol || usuario_rol,
                tipoFinal,
                subtipoFinal,
                fecha_inicio,
                fecha_fin || fecha_inicio,
                hora_inicio || null,
                hora_fin || null,
                horasNum,
                diasNum,
                motivo,
                targetLeaderId
            ], function (insErr) {
                if (insErr) return res.status(500).json({ error: insErr.message });

                const nuevaSolicitudId = this.lastID;

                // Formatear texto descriptivo para la notificación
                let subtipoLegible = 'Permiso';
                let cantidadTexto = `${diasNum} día(s)`;

                if (subtipoFinal === 'HORA_CON_GOCE') {
                    subtipoLegible = 'Permiso por Hora (Con goce)';
                    cantidadTexto = `${horasNum} hr(s) el ${fecha_inicio} (${hora_inicio} a ${hora_fin})`;
                } else if (subtipoFinal === 'HORA_SIN_GOCE') {
                    subtipoLegible = 'Permiso por Hora (Sin goce)';
                    cantidadTexto = `${horasNum} hr(s) el ${fecha_inicio} (${hora_inicio} a ${hora_fin})`;
                } else if (subtipoFinal === 'DIA_CON_GOCE') {
                    subtipoLegible = 'Permiso por Día (Con goce)';
                    cantidadTexto = `${diasNum} día(s) del ${fecha_inicio} al ${fecha_fin}`;
                } else if (subtipoFinal === 'DIA_SIN_GOCE') {
                    subtipoLegible = 'Permiso por Día (Sin goce)';
                    cantidadTexto = `${diasNum} día(s) del ${fecha_inicio} al ${fecha_fin}`;
                } else {
                    subtipoLegible = 'Vacaciones';
                    cantidadTexto = `${diasNum} día(s) libres del ${fecha_inicio} al ${fecha_fin}`;
                }

                const notifTitulo = `Solicitud de ${tipoFinal === 'Vacaciones' ? 'Vacaciones' : 'Permiso'}`;
                const notifMensaje = `${user.nombre} ha solicitado ${subtipoLegible} (${cantidadTexto}). Motivo: "${motivo}".`;

                const nuevaSolicitud = {
                    id: nuevaSolicitudId,
                    usuario_id,
                    usuario_nombre: user.nombre,
                    usuario_rol: user.rol,
                    tipo: tipoFinal,
                    subtipo: subtipoFinal,
                    fecha_inicio,
                    fecha_fin: fecha_fin || fecha_inicio,
                    hora_inicio: hora_inicio || null,
                    hora_fin: hora_fin || null,
                    horas_solicitadas: horasNum,
                    dias_solicitados: diasNum,
                    motivo,
                    estatus: 'PENDIENTE',
                    lider_id: targetLeaderId,
                    lider_nombre: targetLeaderName,
                    fecha_solicitud: new Date().toISOString()
                };

                // Si hay un líder destinatario, registrar notificación persistente y despachar por WebSocket
                if (targetLeaderId) {
                    const notifSql = `
                        INSERT INTO notificaciones (usuario_id, remitente_id, remitente_nombre, remitente_avatar, tipo, titulo, mensaje, referencia_id, leido)
                        VALUES (?, ?, ?, ?, 'SOLICITUD_AUSENCIA', ?, ?, ?, 0)
                    `;
                    db.run(notifSql, [
                        targetLeaderId,
                        usuario_id,
                        user.nombre,
                        user.avatar || user.nombre.substring(0, 2).toUpperCase(),
                        notifTitulo,
                        notifMensaje,
                        nuevaSolicitudId
                    ], function () {
                        const notifObj = {
                            id: this ? this.lastID : Date.now(),
                            usuario_id: targetLeaderId,
                            remitente_id: usuario_id,
                            remitente_nombre: user.nombre,
                            remitente_avatar: user.avatar,
                            tipo: 'SOLICITUD_AUSENCIA',
                            titulo: notifTitulo,
                            mensaje: notifMensaje,
                            referencia_id: nuevaSolicitudId,
                            leido: 0,
                            fecha_creacion: new Date().toISOString()
                        };

                        io.to(`user_${targetLeaderId}`).emit('notificacion:nueva', notifObj);
                        console.log(`🔔 Notificación enviada a Líder Directo ID ${targetLeaderId} (${targetLeaderName}) por solicitud de ${user.nombre}`);
                    });
                }

                io.emit('incidencia:nueva', nuevaSolicitud);
                return res.json({ success: true, data: nuevaSolicitud });
            });
        });
    });
});

app.put('/api/incidencias/:id/aprobar', (req, res) => {
    const { estatus, aprobado_por, rol_aprobador, aprobador_id } = req.body;
    const incID = req.params.id;

    db.get('SELECT * FROM incidencias_vacaciones WHERE id = ?', [incID], (err, inc) => {
        if (err || !inc) return res.status(404).json({ error: 'Solicitud no encontrada' });

        const canApprove = (aprobador_id && inc.lider_id && parseInt(aprobador_id, 10) === parseInt(inc.lider_id, 10)) ||
                           ['ADMIN', 'ABOGADA_SR', 'RH', 'ADMIN_RH'].includes(rol_aprobador);

        if (!canApprove) {
            return res.status(403).json({ error: 'No tienes permisos para autorizar esta solicitud. Solo el líder directo asignado o Recursos Humanos pueden hacerlo.' });
        }

        db.run(
            'UPDATE incidencias_vacaciones SET estatus = ?, aprobado_por = ? WHERE id = ?',
            [estatus, aprobado_por || 'Líder / RH RDL', incID],
            function (updateErr) {
                if (updateErr) return res.status(500).json({ error: updateErr.message });

                // Si fue vacaciones y se aprobó, descontar del saldo
                if (estatus === 'APROBADO' && inc.tipo === 'Vacaciones') {
                    db.run(
                        'UPDATE usuarios SET dias_vacaciones_tomados = dias_vacaciones_tomados + ? WHERE id = ?',
                        [inc.dias_solicitados, inc.usuario_id],
                        () => {
                            db.get('SELECT * FROM usuarios WHERE id = ?', [inc.usuario_id], (uErr, userUpdated) => {
                                if (userUpdated) {
                                    io.emit('usuario:vacaciones_actualizadas', userUpdated);
                                }
                            });
                        }
                    );
                }

                // Notificar al colaborador solicitante de la resolución
                const notifTitulo = `Solicitud ${estatus === 'APROBADO' ? 'Aprobada ✅' : 'Rechazada ❌'}`;
                const notifMensaje = `Tu solicitud de ${inc.tipo} (${inc.subtipo || ''}) fue ${estatus === 'APROBADO' ? 'APROBADA' : 'RECHAZADA'} por ${aprobado_por || 'tu líder'}.`;

                const notifSql = `
                    INSERT INTO notificaciones (usuario_id, remitente_id, remitente_nombre, remitente_avatar, tipo, titulo, mensaje, referencia_id, leido)
                    VALUES (?, ?, ?, 'RDL', 'RESOLUCION_AUSENCIA', ?, ?, ?, 0)
                `;
                db.run(notifSql, [
                    inc.usuario_id,
                    aprobador_id || 0,
                    aprobado_por || 'Líder Directo',
                    notifTitulo,
                    notifMensaje,
                    incID
                ], function() {
                    const resolucionNotif = {
                        id: this ? this.lastID : Date.now(),
                        usuario_id: inc.usuario_id,
                        remitente_nombre: aprobado_por,
                        tipo: 'RESOLUCION_AUSENCIA',
                        titulo: notifTitulo,
                        mensaje: notifMensaje,
                        referencia_id: incID,
                        leido: 0,
                        fecha_creacion: new Date().toISOString()
                    };
                    io.to(`user_${inc.usuario_id}`).emit('notificacion:nueva', resolucionNotif);
                });

                const resObj = { ...inc, estatus, aprobado_por };
                io.emit('incidencia:estatus_cambiado', resObj);
                res.json({ success: true, data: resObj });
            }
        );
    });
});

// 5. MÓDULO DE NOTIFICACIONES
app.get('/api/notificaciones', (req, res) => {
    let usuarioId = req.query.usuario_id;
    if (!usuarioId) {
        const token = (req.cookies && req.cookies.rdl_session) || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (token) {
            const decoded = verificarJwt(token);
            if (decoded) usuarioId = decoded.id;
        }
    }

    if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'Debes iniciar sesión para consultar tus notificaciones.' });
    }

    const query = `
        SELECT * FROM notificaciones 
        WHERE usuario_id = ? 
        ORDER BY fecha_creacion DESC 
        LIMIT 40
    `;
    db.all(query, [usuarioId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const unreadCount = (rows || []).filter(n => n.leido === 0).length;
        res.json({ success: true, data: rows || [], unreadCount });
    });
});

app.put('/api/notificaciones/:id/leer', (req, res) => {
    const notifId = req.params.id;
    db.run('UPDATE notificaciones SET leido = 1 WHERE id = ?', [notifId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/notificaciones/marcar-todas', (req, res) => {
    let usuarioId = req.body && req.body.usuario_id;
    if (!usuarioId) {
        const token = (req.cookies && req.cookies.rdl_session) || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (token) {
            const decoded = verificarJwt(token);
            if (decoded) usuarioId = decoded.id;
        }
    }

    if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'No autenticado.' });
    }

    db.run('UPDATE notificaciones SET leido = 1 WHERE usuario_id = ?', [usuarioId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Ruta para la pantalla de inicio de sesión
app.get('/login', (req, res) => {
    // Si ya tiene sesión activa válida y no es una solicitud de cambio/error, redirigir al Hub
    const token = req.cookies && req.cookies.rdl_session;
    const hasOverride = req.query.error || req.query.force === 'true';

    if (token && !hasOverride && verificarJwt(token)) {
        return res.redirect('/');
    }

    const loginFile = path.join(distPath, 'login', 'index.html');
    if (fs.existsSync(loginFile)) {
        return res.sendFile(loginFile);
    }
    const fallbackLogin = path.join(distPath, 'login.html');
    if (fs.existsSync(fallbackLogin)) {
        return res.sendFile(fallbackLogin);
    }

    // NUNCA enviar index.html aquí porque requiere sesión y crearía un bucle
    return res.status(503).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>RDL Intelligence Hub - Inicializando</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px; background: #0f2d4a; color: #ffffff;">
            <h2>RDL Intelligence Hub</h2>
            <p>La pantalla de inicio de sesión se está compilando o no se encuentra en el servidor.</p>
            <p style="color: #94a3b8; font-size: 14px;">Ejecute <code>npm run build</code> en el servidor para generar los archivos estáticos.</p>
        </body>
        </html>
    `);
});

// Protección de la ruta principal y SPA Fallback para Astro dist
app.get('*', (req, res) => {
    // Rutas públicas y assets estáticos no interceptados
    if (req.path.startsWith('/api/') || req.path.startsWith('/_astro/') || req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path === '/favicon.ico' || req.path === '/Logo RDL.png') {
        return res.status(404).json({ error: 'Recurso no encontrado' });
    }

    // Comprobar cookie de sesión rdl_session, token en query o Bearer header
    const cookieToken = req.cookies && req.cookies.rdl_session;
    const queryToken = req.query && req.query.token;
    const authHeader = req.headers.authorization;
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    const token = cookieToken || queryToken || headerToken;
    const session = token ? verificarJwt(token) : null;

    if (!session) {
        return res.redirect('/login');
    }

    // Si el token provino de la URL o header y no estaba en cookie, establecer la cookie en la respuesta
    if ((queryToken || headerToken) && !cookieToken) {
        const isHttps = req.secure || (req.headers['x-forwarded-proto'] === 'https') || (process.env.NODE_ENV === 'production' && !req.headers.host?.includes(':'));
        res.cookie('rdl_session', token, {
            httpOnly: true,
            secure: isHttps,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
    }

    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    return res.status(503).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>RDL Intelligence Hub - Inicializando</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px; background: #0f2d4a; color: #ffffff;">
            <h2>RDL Intelligence Hub</h2>
            <p>La aplicación se está inicializando.</p>
            <p style="color: #94a3b8; font-size: 14px;">Ejecute <code>npm run build</code> en el servidor para generar los archivos estáticos.</p>
        </body>
        </html>
    `);
});

// Socket.io
io.on('connection', (socket) => {
    console.log(`🔌 Nodo Cliente Conectado: ${socket.id}`);

    socket.on('join_room', (user) => {
        if (user && user.id) {
            socket.join(`user_${user.id}`);
            console.log(`👤 Usuario RDL [${user.nombre} - ${user.rol}] suscrito`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Nodo Cliente Desconectado: ${socket.id}`);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPs();
    console.log(`
========================================================================
🚀 RDL INTELLIGENCE HUB (ASTRO + FLOATING-UI) - SERVIDOR ACTIVO
🌐 Escuchando en 0.0.0.0:${PORT}
📍 Direcciones IP Locales para conectar otras computadoras:
${localIPs.map(ip => `   -> http://${ip}:${PORT}`).join('\n')}
========================================================================
    `);
});
