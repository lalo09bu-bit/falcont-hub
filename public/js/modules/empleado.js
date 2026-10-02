/**
 * FALCONT HUB - Módulo Ficha del Empleado
 */

class EmpleadoModule {
    renderProfile(user) {
        if (!user) return;

        const initials = user.avatar || user.nombre.split(' ').map(n => n[0]).join('').substring(0, 2);

        const avatarEl = document.getElementById('emp-avatar');
        const nameEl = document.getElementById('emp-name');
        const puestoEl = document.getElementById('emp-puesto');
        const deptEl = document.getElementById('emp-dept');

        if (avatarEl) {
            if (user.foto_perfil) {
                avatarEl.innerHTML = `<img src="${user.foto_perfil}" alt="${user.nombre}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                avatarEl.innerHTML = `<span style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">${initials}</span>`;
            }
            avatarEl.style.cursor = 'pointer';
            avatarEl.title = 'Haz clic para ver y editar tu Ficha de Colaborador estilo Buk';
            avatarEl.onclick = () => {
                if (window.perfilMod) {
                    window.perfilMod.openProfile(user.id);
                }
            };
        }
        if (nameEl) nameEl.textContent = user.nombre;
        if (puestoEl) puestoEl.textContent = user.puesto;
        if (deptEl) deptEl.textContent = user.departamento || 'Despacho Contable FALCONT';

        // Saldo de Vacaciones
        const remVacEl = document.getElementById('emp-vacations-remaining');
        const totVacEl = document.getElementById('emp-vacations-total');
        const takVacEl = document.getElementById('emp-vacations-taken');

        if (remVacEl) remVacEl.textContent = user.dias_vacaciones_restantes !== undefined ? user.dias_vacaciones_restantes : 10;
        if (totVacEl) totVacEl.textContent = user.dias_vacaciones_totales || 12;
        if (takVacEl) takVacEl.textContent = user.dias_vacaciones_tomados || 2;

        // Cargar Metas Ponderadas (100%)
        if (window.metasMod) {
            window.metasMod.loadUserMetas(user.id);
        }
    }
}

window.empleadoMod = new EmpleadoModule();
