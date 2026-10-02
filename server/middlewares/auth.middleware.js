import { verificarJwt } from '../services/auth.service.js';

/**
 * Middleware para verificar la sesión activa mediante la cookie `falcont_session` o `rdl_session` o Bearer.
 */
export function verificarSesion(req, res, next) {
    // 1. Extraer token de cookies o header Authorization
    const cookieToken = req.cookies && (req.cookies.falcont_session || req.cookies.rdl_session);
    const authHeader = req.headers.authorization;
    let token = cookieToken;

    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        if (req.originalUrl.startsWith('/api/') || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({
                success: false,
                error: 'No autorizado. Se requiere inicio de sesión.',
                code: 'AUTH_REQUIRED'
            });
        }
        return res.redirect('/login');
    }

    // 2. Verificar y decodificar JWT
    const decoded = verificarJwt(token);

    if (!decoded) {
        // Limpiar cookies corruptas o expiradas
        const clearOpts = {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        };
        res.clearCookie('falcont_session', clearOpts);
        res.clearCookie('rdl_session', clearOpts);

        if (req.originalUrl.startsWith('/api/') || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({
                success: false,
                error: 'Sesión expirada o token inválido.',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.redirect('/login?error=sesion_expirada');
    }

    // 3. Adjuntar usuario autenticado a la petición
    req.user = decoded;
    next();
}

/**
 * Middleware para validar que el usuario tenga uno de los roles autorizados.
 * @param  {...string} rolesPermitidos Lista de roles permitidos (ej. 'ADMIN', 'RH')
 */
export function requerirRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Autenticación requerida' });
        }

        if (!rolesPermitidos.includes(req.user.rol)) {
            return res.status(403).json({
                success: false,
                error: `Acceso denegado. Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}`
            });
        }

        next();
    };
}

export default {
    verificarSesion,
    requerirRol
};
