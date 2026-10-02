# Guía de Interconexión en Tiempo Real Multi-Computadora
## FALCONT HUB - Despacho Contable

Esta guía explica paso a paso cómo conectar **múltiples computadoras** (Dirección, Contadores Senior y Contadores Junior) para que toda la información (muro de comunicados fiscales, avisos del SAT, saldo de vacaciones y balance de metas 100%) se **sincronice en tiempo real** a **cero costo ($0.00)**.

---

## 🏢 Escenario 1: Computadoras en la Misma Oficina (Red Local Wi-Fi / Ethernet) - $0 Costo

Si todas las computadoras están conectadas a la misma red de la oficina:

### Paso 1: Identificar la Computadora Principal (Nodo Servidor FALCONT)
1. Elige la computadora de la oficina que actuará como **Servidor Principal** (por ejemplo, la de la Administración o Dirección).
2. Abre la aplicación haciendo doble clic en **`Iniciar FALCONT HUB.bat`** o el acceso directo en tu Escritorio.
3. En la parte superior derecha de la pantalla, haz clic en la etiqueta **`🌐 Red FALCONT Activa`**.
4. Se abrirá una ventana emergente donde verás la **Dirección IP de esa computadora** (ejemplo: `192.168.1.74`).

### Paso 2: Conectar las demás Computadoras del Despacho
1. En cualquier otra computadora de la oficina (Contador SR o JR), abre el navegador o la aplicación **`FALCONT HUB`**.
2. En el Header superior, haz clic en **`🌐 Red FALCONT Activa`**.
3. En la casilla que dice **"IP del Nodo Servidor FALCONT"**, escribe la IP de la Computadora Principal (por ejemplo: `192.168.1.74` o navega directamente a `http://192.168.1.74:9060`).
4. Haz clic en **"Vincular y Conectar en Tiempo Real"**.

> ✅ **¡Listo!** A partir de este momento, las aplicaciones quedan vinculadas en tiempo real vía **Socket.io WebSockets**. Cualquier publicación en el muro, reacción de "Me Gusta", comentario o aprobación de vacaciones que ocurra en una máquina se reflejará al instante en las demás computadoras.

---

## ☁️ Escenario 2: Despliegue Online en la Nube con Render (100% Gratuito - Plan Free)

Para que el despacho contable y clientes puedan acceder desde cualquier lugar por Internet:

1. **Plan Gratuito de Render ($0.00/mes):**
   - Render ofrece un nivel **Free** que incluye servidor Node.js, certificado de seguridad SSL HTTPS automático y subdominio `.onrender.com`.
   - No requiere pagar ninguna suscripción ni tarjeta para el plan Free.
   - En Render, selecciona **Instance Type: Free ($0/mo)**.

---

## 🏠 Escenario 3: Computadoras Remotas / Home Office con Tailscale ($0 Costo)

Si algún contador trabaja desde su casa o fuera del despacho sin subirlo a la nube:

1. **Instalar Tailscale (100% Gratuito y Cifrado):**
   - Descarga e instala **[Tailscale](https://tailscale.com)** en la Computadora Principal y en las computadoras remotas (gratuito hasta 100 dispositivos).
   - Tailscale asignará una IP privada segura (ejemplo: `100.80.120.15`).

2. **Vincular en la Aplicación:**
   - En las computadoras de casa, ingresa la IP de Tailscale (`100.80.120.15:9060`) en el modal de Red.
   - La comunicación viajará cifrada de extremo a extremo sin pagar servidores externos ni licencias cloud.
