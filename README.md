# 🏛️ FALCONT HUB - Despacho Contable

Portal institucional para la gestión integral de talento, despacho contable, balance de metas y KPIs ponderados (100%), incidencias laborales, control de vacaciones y comunicación interna en tiempo real para **FALCONT Despacho Contable**.

---

## 🎨 Identidad Institucional & Colores Oficiales

- **Azul Acero Primario (Alas del Emblema):** `#55789B`
- **Azul Acero Oscuro / Navy:** `#2C4661`
- **Negro Carbón Institucional (Tipografía FALCONT):** `#231E1E`
- **Fondo Corporativo:** `#FFFFFF` / `#F8FAFC`
- **Tipografía:** Inter / SF Pro Display

---

## 🚀 Inicio Rápido (Instalación Local)

### 1. Requisitos Previos
- **Node.js** (v18 o superior)
- **Git**

### 2. Pasos de Instalación
```bash
# 1. Clonar el repositorio
git clone https://github.com/lalo09bu-bit/falcont-hub.git
cd falcont-hub

# 2. Instalar dependencias
npm install

# 3. Compilar la interfaz (Astro)
npm run build

# 4. Iniciar la plataforma
npm start
```
El sistema estará escuchando en **`http://localhost:9060`** (o en el puerto definido por la variable `PORT`).

---

## 👥 Cuentas de Prueba Corporativas (Modo Dev / 1-Clic)

En la pantalla de acceso (`/login`), se incluye un panel de acceso directo de 1 clic para demostración con clientes:

| Perfil / Colaborador | Correo Institucional | RFC | Rol | Permisos Destacados |
| :--- | :--- | :--- | :--- | :--- |
| **C.P.C. Carlos Mendoza (Demo 360°)** | `demo@falcont.com.mx` | `DEMO880101FLC` | `ADMIN` | 🎯 Metas 100% ponderadas, panel de control total, aprobación de vacaciones, exportación de reportes |
| **Lic. Andrés Cosmes** | `rh@falcont.com.mx` | `COSR880101FLC` | `RH` | Gestión de personal, aprobación de incidencias, creación de colaboradores |
| **C.P. Valeria Falcón** | `valeria.falcon@falcont.com.mx` | `FALV900101FLC` | `CONTADOR_SR` | Publicación en muro, asignación y seguimiento de metas contables |
| **C.P. Denis Ramos** | `denis.ramos@falcont.com.mx` | `RAMD950101FLC` | `CONTADOR_JR` | Solicitud de vacaciones con goce pendiente de autorización |

---

## ☁️ Despliegue en Render Cloud

El repositorio contiene `render.yaml` (Render Blueprint) para un despliegue automatizado con cero fricción:

### Opción 1: Conectar Repositorio en Render (Recomendada)
1. Inicia sesión en [Render Dashboard](https://dashboard.render.com).
2. Haz clic en **New +** y selecciona **Web Service**.
3. Conecta tu repositorio de GitHub: `lalo09bu-bit/falcont-hub`.
4. Configura los parámetros:
   - **Name:** `falcont-hub`
   - **Region:** Oregon (US West) u Ohio (US East)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. En la sección **Environment Variables**, añade:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `JWT_SECRET`: *(cualquier clave secreta segura de 32+ caracteres)*
6. Haz clic en **Create Web Service**. ¡Render compilará y desplegará tu aplicación automáticamente!

### Opción 2: Usar Render Blueprint
1. En Render Dashboard, haz clic en **New +** > **Blueprint**.
2. Conecta el repositorio `lalo09bu-bit/falcont-hub`. Render leerá automáticamente el archivo `render.yaml` y configurará todo.

---

## 🔒 Dominios Institucionales Autorizados para Login

- `@falcont.com.mx`
- `@falcont.mx`
- `@adeltaconsultores.com`
- `@rdlabogados.com.mx`
