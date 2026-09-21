-- ============================================================
-- RDL Intelligence Hub - Esquema de Base de Datos SQLite
-- Plataforma Multi-Cliente Interconectada 100% RDL
-- ============================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA DE USUARIOS Y ROLES (ADMINISTRADOR, ABOGADA SR, ABOGADA JR - FICHA ESTILO BUK)
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT CHECK(rol IN ('RH', 'ADMIN_RH', 'ADMIN', 'ABOGADA_SR', 'ABOGADA_JR')) NOT NULL DEFAULT 'ABOGADA_JR',
    puesto TEXT NOT NULL,
    departamento TEXT NOT NULL DEFAULT 'Legal & Talent',
    avatar TEXT NOT NULL DEFAULT 'avatar-default.png',
    foto_perfil TEXT DEFAULT NULL,
    telefono TEXT DEFAULT '+52 (55) 0000-0000',
    fecha_ingreso DATE DEFAULT '2026-01-15',
    tipo_contrato TEXT DEFAULT 'Tiempo Indeterminado',
    numero_empleado TEXT DEFAULT 'RDL-001',
    rfc TEXT UNIQUE,
    salario_base TEXT DEFAULT 'Confidencial',
    estatus_laboral TEXT CHECK(estatus_laboral IN ('ACTIVO', 'INACTIVO', 'LICENCIA')) NOT NULL DEFAULT 'ACTIVO',
    dias_vacaciones_totales INTEGER NOT NULL DEFAULT 15,
    dias_vacaciones_tomados INTEGER NOT NULL DEFAULT 3,
    dias_vacaciones_restantes INTEGER GENERATED ALWAYS AS (dias_vacaciones_totales - dias_vacaciones_tomados) STORED
);

-- 2. TABLA DE COMUNICACIÓN GENERAL / MURO ESTILO FACEBOOK
CREATE TABLE IF NOT EXISTS feed_publicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    autor_id INTEGER NOT NULL,
    autor_nombre TEXT NOT NULL,
    autor_rol TEXT NOT NULL,
    autor_avatar TEXT NOT NULL,
    titulo TEXT,
    contenido TEXT NOT NULL,
    categoria TEXT CHECK(categoria IN ('Corporativo', 'Aviso Legal', 'Integracion', 'Urgente', 'Reconocimiento')) NOT NULL DEFAULT 'Corporativo',
    imagen_url TEXT DEFAULT NULL,
    likes_count INTEGER NOT NULL DEFAULT 0,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 3. TABLA DE COMENTARIOS EN EL MURO CORPORATIVO
CREATE TABLE IF NOT EXISTS feed_comentarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER NOT NULL,
    autor_id INTEGER NOT NULL,
    autor_nombre TEXT NOT NULL,
    autor_avatar TEXT NOT NULL,
    comentario TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (publicacion_id) REFERENCES feed_publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 4. TABLA DE REACCIONES (LIKES) POR USUARIO
CREATE TABLE IF NOT EXISTS feed_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(publicacion_id, usuario_id),
    FOREIGN KEY (publicacion_id) REFERENCES feed_publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 5. TABLA DE METAS Y OBJETIVOS DEL EMPLEADO (ESTILO BUK & METAS PONDERADAS 100%)
CREATE TABLE IF NOT EXISTS metas_empleado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    indicador TEXT NOT NULL DEFAULT 'Cumplimiento de objetivos',
    peso REAL NOT NULL DEFAULT 25.0,
    porcentaje_avance REAL NOT NULL DEFAULT 0.0,
    categoria TEXT CHECK(categoria IN ('Caso Legal', 'Desempeño', 'Capacitación', 'OKR')) NOT NULL DEFAULT 'Caso Legal',
    fecha_limite DATE NOT NULL DEFAULT '2026-12-31',
    estatus TEXT CHECK(estatus IN ('EN_PROGRESO', 'COMPLETADO', 'EN_RIESGO')) NOT NULL DEFAULT 'EN_PROGRESO',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 6. TABLA DE SOLICITUDES DE VACACIONES E INCIDENCIAS
CREATE TABLE IF NOT EXISTS incidencias_vacaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    usuario_nombre TEXT NOT NULL,
    usuario_rol TEXT NOT NULL,
    tipo TEXT CHECK(tipo IN ('Vacaciones', 'Permiso Especial', 'Incapacidad', 'Falta Justificada')) NOT NULL DEFAULT 'Vacaciones',
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    dias_solicitados INTEGER NOT NULL DEFAULT 1,
    motivo TEXT NOT NULL,
    estatus TEXT CHECK(estatus IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')) NOT NULL DEFAULT 'PENDIENTE',
    aprobado_por TEXT DEFAULT NULL,
    fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 7. TABLA DE TOKENS DE AUTENTICACIÓN (MAGIC LINKS)
CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expira_en DATETIME NOT NULL,
    usado INTEGER DEFAULT 0 CHECK(usado IN (0, 1)),
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ÍNDICES DE RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_feed_fecha ON feed_publicaciones(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_metas_usuario ON metas_empleado(usuario_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_usuario ON incidencias_vacaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_usuario ON auth_tokens(usuario_id);
