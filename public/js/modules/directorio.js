/**
 * RDL Intelligence Hub - Módulo de Búsqueda y Directorio de Colaboradores (Estilo Buk)
 * Búsqueda instantánea en tiempo real con ponderación de metas y ficha de perfil completa
 */

class DirectorioModule {
    constructor() {
        this.searchInput = null;
        this.dropdown = null;
        this.debounceTimer = null;
        this.results = [];
        this.selectedIndex = -1;
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.searchInput = document.getElementById('header-search-input');
            this.dropdown = document.getElementById('header-search-results');

            if (this.searchInput) {
                this.searchInput.addEventListener('input', (e) => this.onSearchInput(e.target.value));
                this.searchInput.addEventListener('focus', () => {
                    if (this.searchInput.value.trim().length > 0) {
                        this.showDropdown();
                    } else {
                        this.searchColaboradores('');
                    }
                });
                this.searchInput.addEventListener('keydown', (e) => this.onKeyDown(e));
            }

            // Atajo de teclado global Ctrl+K o Cmd+K
            window.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    if (this.searchInput) {
                        this.searchInput.focus();
                        this.searchInput.select();
                        this.searchColaboradores(this.searchInput.value.trim());
                    }
                }
            });

            // Cerrar dropdown al hacer clic fuera
            document.addEventListener('click', (e) => {
                const searchContainer = document.getElementById('header-search-container');
                if (searchContainer && !searchContainer.contains(e.target)) {
                    this.hideDropdown();
                }
            });
        });

        // Escuchar actualizaciones en tiempo real de colaboradores
        window.addEventListener('rdl_usuario_creado', () => {
            if (this.isDropdownOpen()) {
                this.searchColaboradores(this.searchInput ? this.searchInput.value.trim() : '');
            }
        });

        window.addEventListener('rdl_perfil_actualizado', () => {
            if (this.isDropdownOpen()) {
                this.searchColaboradores(this.searchInput ? this.searchInput.value.trim() : '');
            }
        });
    }

    onSearchInput(query) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.searchColaboradores(query.trim());
        }, 180);
    }

    onKeyDown(e) {
        if (!this.isDropdownOpen() || this.results.length === 0) {
            if (e.key === 'Escape') this.hideDropdown();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
            this.updateSelectionHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
            this.updateSelectionHighlight();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.selectedIndex >= 0 && this.selectedIndex < this.results.length) {
                this.selectColaborador(this.results[this.selectedIndex].id);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hideDropdown();
        }
    }

    updateSelectionHighlight() {
        const items = this.dropdown.querySelectorAll('.search-result-item');
        items.forEach((item, idx) => {
            if (idx === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    async searchColaboradores(query = '') {
        try {
            const url = query ? `/api/colaboradores/search?q=${encodeURIComponent(query)}` : `/api/colaboradores/search`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                this.results = data.data || [];
                this.renderDropdown(this.results, query);
                this.showDropdown();
                this.selectedIndex = -1;
            }
        } catch (err) {
            console.error('Error buscando colaboradores:', err);
        }
    }

    renderDropdown(colaboradores, query) {
        if (!this.dropdown) return;

        if (colaboradores.length === 0) {
            this.dropdown.innerHTML = `
                <div class="search-empty-state">
                    <span>🔍</span>
                    <p>No se encontraron colaboradoras para "<strong>${this.escapeHtml(query)}</strong>"</p>
                    <small>Intenta buscando por nombre, puesto, departamento o número de empleado.</small>
                </div>
            `;
            return;
        }

        const headerHtml = `
            <div class="search-dropdown-header">
                <span>Directorio de Colaboradores (${colaboradores.length})</span>
                <span class="search-shortcut-hint">Usa ↑ ↓ y Enter para seleccionar</span>
            </div>
        `;

        const itemsHtml = colaboradores.map((c, idx) => {
            let roleClass = 'badge-jr';
            let roleLabel = 'Contador JR';
            if (c.rol === 'RH' || c.rol === 'ADMIN_RH') { roleClass = 'badge-rh'; roleLabel = 'RH'; }
            else if (c.rol === 'ADMIN') { roleClass = 'badge-admin'; roleLabel = 'Admin'; }
            else if (c.rol === 'CONTADOR_SR' || c.rol === 'ABOGADA_SR') { roleClass = 'badge-sr'; roleLabel = 'Contador SR'; }
            else if (c.rol === 'CONTADOR_JR' || c.rol === 'ABOGADA_JR') { roleClass = 'badge-jr'; roleLabel = 'Contador JR'; }

            const avatarContent = c.foto_perfil 
                ? `<img src="${c.foto_perfil}" alt="${c.nombre}" class="search-avatar-img">`
                : `<div class="search-avatar-initials">${c.avatar || c.nombre.substring(0, 2).toUpperCase()}</div>`;

            const statusClass = (c.estatus_laboral === 'Activo' || !c.estatus_laboral) ? 'status-dot-active' : 'status-dot-vacation';
            const statusText = c.estatus_laboral || 'Activo';

            // Ponderación de Metas
            let weightPill = '';
            if (c.total_metas > 0) {
                const scoreColor = c.desempeno_global >= 80 ? 'var(--accent-green-bright)' : '#fbbf24';
                weightPill = `
                    <div class="search-metas-summary" title="Desempeño global ponderado: ${c.desempeno_global}% (${c.suma_pesos}% pesos)">
                        <span class="search-kpi-badge" style="color: ${scoreColor};">🎯 ${c.desempeno_global}% Desempeño</span>
                        <span class="search-goals-count">(${c.total_metas} metas)</span>
                    </div>
                `;
            } else {
                weightPill = `
                    <div class="search-metas-summary">
                        <span class="search-goals-count" style="color: var(--text-dim);">⚪ Sin metas asignadas</span>
                    </div>
                `;
            }

            return `
                <div class="search-result-item" data-id="${c.id}" onclick="directorioMod.selectColaborador(${c.id})">
                    <div class="search-item-avatar-wrapper">
                        ${avatarContent}
                        <div class="search-status-dot ${statusClass}" title="${statusText}"></div>
                    </div>
                    <div class="search-item-main">
                        <div class="search-item-top">
                            <span class="search-item-name">${c.nombre}</span>
                            <span class="role-badge ${roleClass}">${roleLabel}</span>
                        </div>
                        <div class="search-item-sub">
                            <span>💼 ${c.puesto}</span>
                            <span class="search-dot-sep">•</span>
                            <span>🏢 ${c.departamento || 'Legal'}</span>
                            ${c.numero_empleado ? `<span class="search-dot-sep">•</span><span>🆔 ${c.numero_empleado}</span>` : ''}
                        </div>
                    </div>
                    <div class="search-item-extra">
                        ${weightPill}
                        <span class="search-action-arrow">Ver Ficha ➔</span>
                    </div>
                </div>
            `;
        }).join('');

        this.dropdown.innerHTML = headerHtml + `<div class="search-results-list">${itemsHtml}</div>`;
    }

    selectColaborador(id) {
        this.hideDropdown();
        if (this.searchInput) {
            this.searchInput.blur();
        }
        if (window.perfilMod) {
            window.perfilMod.openProfile(id);
        }
    }

    openDirectory() {
        if (this.searchInput) {
            this.searchInput.focus();
            this.searchInput.value = '';
            this.searchColaboradores('');
        }
    }

    showDropdown() {
        if (this.dropdown) this.dropdown.classList.add('active');
    }

    hideDropdown() {
        if (this.dropdown) this.dropdown.classList.remove('active');
        this.selectedIndex = -1;
    }

    isDropdownOpen() {
        return this.dropdown && this.dropdown.classList.contains('active');
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m]));
    }
}

window.directorioMod = new DirectorioModule();
