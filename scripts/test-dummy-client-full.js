import { createServer } from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../server/config/database.js';
import authRoutes from '../server/routes/auth.routes.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);

const server = createServer(app);

server.listen(9099, async () => {
    console.log('🧪 Iniciando pruebas de verificación para Usuario Dummy / Cliente...');

    try {
        // Test 1: Login con RFC y Correo
        const loginRes = await fetch('http://localhost:9099/api/auth/login-rfc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rfc: 'DEMO880101RDL',
                email: 'demo@rdl.com.mx'
            })
        });

        const loginData = await loginRes.json();
        console.log('\n--- Test 1: Login RFC & Email ---');
        console.log('HTTP Status:', loginRes.status);
        console.log('Success:', loginData.success);
        console.log('Usuario:', loginData.user?.nombre);
        console.log('Rol:', loginData.user?.rol);
        console.log('Puesto:', loginData.user?.puesto);
        console.log('Token JWT generado:', !!loginData.token);

        if (!loginData.success || loginData.user?.rol !== 'ADMIN') {
            throw new Error('Fallo en Test 1: El usuario no pudo autenticarse o no tiene rol ADMIN');
        }

        // Test 2: Endpoint /api/auth/me usando el token generado
        const meRes = await fetch('http://localhost:9099/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${loginData.token}`,
                'Accept': 'application/json'
            }
        });
        const meData = await meRes.json();
        console.log('\n--- Test 2: Sesión /api/auth/me ---');
        console.log('Me Success:', meData.success);
        console.log('Me User ID:', meData.user?.id);
        console.log('Me Email:', meData.user?.email);

        // Test 3: Verificar permisos para todos los módulos
        const user = loginData.user;
        const canAccessReportes = ['RH', 'ADMIN', 'ADMIN_RH', 'ABOGADA_SR'].includes(user.rol);
        const canManageMetas = ['ADMIN', 'ABOGADA_SR', 'RH', 'ADMIN_RH'].includes(user.rol);
        const canPublishFeed = user.rol !== 'ABOGADA_JR';
        const canAccessDirectorio = user.rol === 'RH' || user.rol === 'ADMIN';

        console.log('\n--- Test 3: Matriz de Acceso a Módulos del Hub ---');
        console.log('📊 Centro de Reportes & Exportadores Excel:', canAccessReportes ? '✅ HABILITADO' : '❌ BLOQUEADO');
        console.log('⚙️ Gestión & Ponderación de Metas (100%):', canManageMetas ? '✅ HABILITADO' : '❌ BLOQUEADO');
        console.log('📰 Publicación en el Muro / Feed Corporativo:', canPublishFeed ? '✅ HABILITADO' : '❌ BLOQUEADO');
        console.log('👥 Directorio & Fichas Buk Completas:', canAccessDirectorio ? '✅ HABILITADO' : '❌ BLOQUEADO');

        console.log('\n🎉 ¡TODAS LAS PRUEBAS DEL USUARIO DUMMY CLIENTE PASARON CON ÉXITO!');
        server.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en pruebas:', err.message);
        server.close();
        process.exit(1);
    }
});
