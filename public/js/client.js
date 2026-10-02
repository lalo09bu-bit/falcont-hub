/**
 * FALCONT HUB - Client WebSocket & Interconexión Engine
 * Conexión en tiempo real multi-computadora
 */

class ClientSocketHandler {
    constructor() {
        this.socket = null;
        const savedUrl = localStorage.getItem('falcont_server_ip') || localStorage.getItem('rdl_server_ip');
        if (savedUrl && (savedUrl.startsWith('http://') || savedUrl.startsWith('https://'))) {
            this.serverUrl = savedUrl;
        } else if (window.location.protocol === 'https:' || window.location.port === '' || window.location.port === '80' || window.location.port === '443') {
            this.serverUrl = window.location.origin;
        } else {
            this.serverIp = savedUrl || window.location.hostname || 'localhost';
            this.serverPort = window.location.port || 9060;
            this.serverUrl = `http://${this.serverIp}:${this.serverPort}`;
        }
        this.isConnected = false;
        
        this.init();
    }

    init() {
        console.log(`🔌 Conectando a Nodo FALCONT: ${this.serverUrl}...`);
        
        if (typeof io !== 'undefined') {
            this.socket = io(this.serverUrl, {
                reconnection: true,
                reconnectionAttempts: 15,
                reconnectionDelay: 1500,
                transports: ['websocket', 'polling']
            });

            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log(`✅ Conectado a Red FALCONT con ID: ${this.socket.id}`);
            this.updateNetworkStatus(true);
            
            // Unir usuario activo al canal
            if (window.currentUser) {
                this.socket.emit('join_room', window.currentUser);
            }
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.warn('⚠️ Desconectado de Red FALCONT.');
            this.updateNetworkStatus(false);
        });

        // 1. Nuevo Post en Muro
        this.socket.on('feed:nuevo_post', (post) => {
            console.log('📢 Real-time: Nueva publicación en el Muro FALCONT', post);
            window.dispatchEvent(new CustomEvent('rdl_nuevo_post', { detail: post }));
            this.showToast(`📢 Nuevo Comunicado: ${post.titulo || post.autor_nombre}`, 'info');
        });

        // 2. Like en Muro
        this.socket.on('feed:like_actualizado', (data) => {
            window.dispatchEvent(new CustomEvent('rdl_like_actualizado', { detail: data }));
        });

        // 3. Comentario en Muro
        this.socket.on('feed:nuevo_comentario', (com) => {
            window.dispatchEvent(new CustomEvent('rdl_nuevo_comentario', { detail: com }));
        });

        // 4. Actualización de Saldo de Vacaciones
        this.socket.on('usuario:vacaciones_actualizadas', (user) => {
            window.dispatchEvent(new CustomEvent('rdl_vacaciones_actualizadas', { detail: user }));
            if (window.currentUser && window.currentUser.id === user.id) {
                this.showToast(`🎉 ¡Tus vacaciones han sido aprobadas! Días restantes: ${user.dias_vacaciones_restantes}`, 'success');
            }
        });

        // 5. Notificación Personal en Tiempo Real (Líder Directo o Solicitante)
        this.socket.on('notificacion:nueva', (notif) => {
            console.log('🔔 Real-time: Nueva notificación recibida:', notif);
            window.dispatchEvent(new CustomEvent('rdl_nueva_notificacion', { detail: notif }));
            this.showToast(`🔔 ${notif.titulo}: ${notif.mensaje}`, 'info');
        });

        // 5.1 Nueva solicitud de incidencia/permiso en el sistema
        this.socket.on('incidencia:nueva', (inc) => {
            window.dispatchEvent(new CustomEvent('rdl_nueva_incidencia', { detail: inc }));
            const isTargetLeader = window.currentUser && inc.lider_id && window.currentUser.id === inc.lider_id;
            const isManager = window.currentUser && (window.currentUser.rol === 'ADMIN' || window.currentUser.rol === 'RH' || window.currentUser.rol === 'ADMIN_RH');
            if (isTargetLeader || isManager) {
                this.showToast(`📝 ${inc.usuario_nombre} envió solicitud de ${inc.tipo} (${inc.subtipo || ''})`, 'info');
            }
        });

        // 6. Nuevo perfil de usuario registrado
        this.socket.on('usuario:creado', (user) => {
            console.log('👤 Real-time: Nuevo perfil RDL registrado:', user);
            window.dispatchEvent(new CustomEvent('rdl_usuario_creado', { detail: user }));
            this.showToast(`👤 Nuevo perfil registrado: ${user.nombre} (${user.rol})`, 'success');
        });

        // 7. Metas y KPIs actualizados en tiempo real
        this.socket.on('metas:actualizadas', (data) => {
            console.log('🎯 Real-time: Metas actualizadas:', data);
            window.dispatchEvent(new CustomEvent('rdl_metas_actualizadas', { detail: data }));
        });
    }

    reconnectToIP(target) {
        if (!target) return;
        let url = target.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.includes(':') || url.includes('.') || url === 'localhost') {
                url = url.includes(':') ? `http://${url}` : `http://${url}:9060`;
            }
        }
        localStorage.setItem('rdl_server_ip', url);
        this.serverUrl = url;
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        document.getElementById('modal-network')?.classList.remove('active');
        this.showToast(`Conectando con: ${url}...`, 'info');
        this.init();
    }

    updateNetworkStatus(connected) {
        const text = document.getElementById('network-status-text');
        if (text) {
            text.textContent = connected ? `En línea` : `Reconectando...`;
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);

        if (typeof gsap !== 'undefined') {
            gsap.fromTo(toast, 
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.7)' }
            );

            gsap.to(toast, {
                opacity: 0,
                y: -20,
                duration: 0.3,
                delay: 4.5,
                onComplete: () => toast.remove()
            });
        } else {
            setTimeout(() => toast.remove(), 4500);
        }
    }
}

window.clientSocket = new ClientSocketHandler();
