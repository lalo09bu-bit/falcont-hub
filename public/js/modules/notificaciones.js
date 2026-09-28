/**
 * RDL Intelligence Hub - Módulo de Notificaciones en Tiempo Real
 * Campana de alertas, badge de no leídos y panel desplegable
 */

class NotificacionesModule {
    constructor() {
        this.notificaciones = [];
        this.unreadCount = 0;
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            // Cerrar dropdown al hacer clic fuera
            document.addEventListener('click', (e) => {
                const wrapper = document.getElementById('notifications-wrapper');
                const panel = document.getElementById('notifications-dropdown-panel');
                if (wrapper && panel && !wrapper.contains(e.target)) {
                    panel.classList.add('hidden');
                }
            });
        });

        // Escuchar notificación entrante en tiempo real (despachada desde client.js)
        window.addEventListener('rdl_nueva_notificacion', (e) => {
            this.handleNuevaNotificacion(e.detail);
        });
    }

    async initUser(user) {
        if (!user) return;
        await this.loadNotifications();
    }

    async loadNotifications() {
        if (!window.currentUser) return;
        try {
            const res = await fetch(`/api/notificaciones?usuario_id=${window.currentUser.id}`);
            const data = await res.json();
            if (data.success) {
                this.notificaciones = data.data || [];
                this.unreadCount = data.unreadCount || 0;
                this.renderBadge();
                this.renderList();
            }
        } catch (err) {
            console.error('Error cargando notificaciones:', err);
        }
    }

    toggleDropdown() {
        const panel = document.getElementById('notifications-dropdown-panel');
        if (!panel) return;

        const isOpening = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');

        if (isOpening) {
            this.loadNotifications();
        }
    }

    renderBadge() {
        const badge = document.getElementById('notifications-unread-count');
        if (!badge) return;

        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    renderList() {
        const container = document.getElementById('notifications-list-container');
        if (!container) return;

        if (!this.notificaciones || this.notificaciones.length === 0) {
            container.innerHTML = `
                <div class="notifications-empty">
                    <span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">✨</span>
                    <span>No tienes notificaciones pendientes</span>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.notificaciones.forEach(notif => {
            const item = document.createElement('div');
            item.className = `notification-item ${notif.leido ? 'read' : 'unread'}`;
            item.id = `notif-item-${notif.id}`;

            const timeStr = this.formatRelativeTime(notif.fecha_creacion);
            const icon = notif.tipo === 'SOLICITUD_AUSENCIA' ? '📋' : (notif.tipo === 'RESOLUCION_AUSENCIA' ? '⚖️' : '🔔');

            item.innerHTML = `
                <div class="notif-avatar">${icon}</div>
                <div class="notif-content" onclick="notificacionesMod.handleNotifClick(${notif.id}, '${notif.tipo}', ${notif.referencia_id || 'null'})">
                    <div class="notif-title-row">
                        <span class="notif-title">${notif.titulo}</span>
                        <span class="notif-time">${timeStr}</span>
                    </div>
                    <p class="notif-message">${notif.mensaje}</p>
                </div>
                ${!notif.leido ? `
                    <button class="btn-notif-mark" onclick="event.stopPropagation(); notificacionesMod.markRead(${notif.id})" title="Marcar como leída">
                        •
                    </button>
                ` : ''}
            `;
            container.appendChild(item);
        });
    }

    async handleNotifClick(notifId, tipo, refId) {
        await this.markRead(notifId);

        // Si es una solicitud de ausencia o resolución, abrir el modal de vacaciones / permisos
        if (tipo === 'SOLICITUD_AUSENCIA' || tipo === 'RESOLUCION_AUSENCIA') {
            const panel = document.getElementById('notifications-dropdown-panel');
            if (panel) panel.classList.add('hidden');

            if (window.vacacionesMod) {
                window.vacacionesMod.openModal();
            }
        }
    }

    async markRead(notifId) {
        try {
            const res = await fetch(`/api/notificaciones/${notifId}/leer`, { method: 'PUT' });
            const data = await res.json();
            if (data.success) {
                const notif = this.notificaciones.find(n => n.id === notifId);
                if (notif && !notif.leido) {
                    notif.leido = 1;
                    this.unreadCount = Math.max(0, this.unreadCount - 1);
                    this.renderBadge();
                    const el = document.getElementById(`notif-item-${notifId}`);
                    if (el) {
                        el.classList.remove('unread');
                        el.classList.add('read');
                        const markBtn = el.querySelector('.btn-notif-mark');
                        if (markBtn) markBtn.remove();
                    }
                }
            }
        } catch (err) {
            console.error('Error al marcar notificación:', err);
        }
    }

    async markAllRead() {
        if (!window.currentUser) return;
        try {
            const res = await fetch('/api/notificaciones/marcar-todas', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id: window.currentUser.id })
            });
            const data = await res.json();
            if (data.success) {
                this.notificaciones.forEach(n => n.leido = 1);
                this.unreadCount = 0;
                this.renderBadge();
                this.renderList();
            }
        } catch (err) {
            console.error('Error al marcar todas como leídas:', err);
        }
    }

    handleNuevaNotificacion(notif) {
        // Añadir a la lista en memoria
        this.notificaciones.unshift(notif);
        this.unreadCount++;
        this.renderBadge();
        this.renderList();

        // Mostrar animación de temblor en la campana
        const bell = document.getElementById('btn-notifications-toggle');
        if (bell) {
            bell.classList.add('bell-ring');
            setTimeout(() => bell.classList.remove('bell-ring'), 1000);
        }
    }

    formatRelativeTime(isoDateStr) {
        if (!isoDateStr) return '';
        const now = new Date();
        const date = new Date(isoDateStr);
        const diffSec = Math.floor((now - date) / 1000);

        if (diffSec < 60) return 'Hace un momento';
        if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
        if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} h`;
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    }
}

window.notificacionesMod = new NotificacionesModule();
