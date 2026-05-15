const canvas = document.getElementById("juegoCanvas");
const ctx = canvas.getContext("2d");

// --- CONFIGURACIÓN DE IMÁGENES ---
const assets = {
    fondo: new Image(),
    jugador: new Image(),
    chicle: new Image(),
    hoja: new Image(),
    pajaro: new Image(),
    caca: new Image()
};

assets.fondo.src    = 'assets/fondo.png';
assets.jugador.src  = 'assets/personaje.png';
assets.chicle.src   = 'assets/chicle.png';
assets.hoja.src     = 'assets/hoja.png';
assets.pajaro.src   = 'assets/pajaro.png';
assets.caca.src     = 'assets/caca.png';

let cargadas = 0;
const TOTAL_ASSETS = Object.keys(assets).length;
Object.values(assets).forEach(img => {
    img.onload = () => { cargadas++; if (cargadas === TOTAL_ASSETS) iniciar(); };
    // Si un asset falla (pajaro/caca aún no subidos) el juego arranca igual
    img.onerror = () => { cargadas++; if (cargadas === TOTAL_ASSETS) iniciar(); };
});

// --- SONIDOS (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function reproducirSonido(frecuencia, tipo, duracion, volumen = 0.3, frecFinal = null) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, audioCtx.currentTime);
    if (frecFinal !== null) osc.frequency.linearRampToValueAtTime(frecFinal, audioCtx.currentTime + duracion);
    gain.gain.setValueAtTime(volumen, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracion);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duracion);
}

function sonidoChicle() { reproducirSonido(520, 'square', 0.08, 0.25); }
function sonidoCaida()   { reproducirSonido(220, 'sawtooth', 0.18, 0.2, 80); }
function sonidoHoja()    { reproducirSonido(880, 'sine', 0.15, 0.3); setTimeout(() => reproducirSonido(1100, 'sine', 0.1, 0.15), 80); }
function sonidoCaca()    { reproducirSonido(300, 'sawtooth', 0.05, 0.4, 80); setTimeout(() => reproducirSonido(150, 'sawtooth', 0.12, 0.35, 60), 50); }

// --- VARIABLES DEL JUEGO ---
let puntuacion = 0;
let vidas = 3;
let juegoTerminado = false;
let objetos = [];
let pajaros = [];
let cacas = [];
let nivelDificultad = 1;
let pajaroActivado = false;
let intervaloObjetos = null;
let intervaloPajaro = null;

const jugador = {
    x: 170, y: 400, ancho: 60, alto: 80,
    velocidad: 8, movIzq: false, movDer: false
};

// --- CONTROLES DE TECLADO ---
window.onkeydown = e => {
    if (e.key === "ArrowLeft")  jugador.movIzq = true;
    if (e.key === "ArrowRight") jugador.movDer = true;
};
window.onkeyup = e => {
    if (e.key === "ArrowLeft")  jugador.movIzq = false;
    if (e.key === "ArrowRight") jugador.movDer = false;
};

// --- CONTROLES TÁCTILES ---
function obtenerPosicionToque(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
}
canvas.ontouchstart = e => { e.preventDefault(); moverConDedo(e); };
canvas.ontouchmove  = e => { e.preventDefault(); moverConDedo(e); };
function moverConDedo(e) {
    let nuevaX = obtenerPosicionToque(e) - jugador.ancho / 2;
    jugador.x = Math.max(0, Math.min(canvas.width - jugador.ancho, nuevaX));
}

// --- GENERACIÓN DE OBJETOS ---
function crearObjeto() {
    if (juegoTerminado) return;
    nivelDificultad = 1 + Math.floor(puntuacion / 100) * 0.1;

    const generarIndividual = () => {
        const tipo = Math.random() > 0.85 ? 'hoja' : 'chicle';
        objetos.push({
            x: Math.random() * (canvas.width - 30),
            y: -30, ancho: 25, alto: 25,
            vel: (1 + Math.random() * 1) * nivelDificultad,
            tipo
        });
    };
    generarIndividual();
    if (Math.random() > 0.85) setTimeout(generarIndividual, 150);
}

// --- PÁJARO ---
function crearPajaro() {
    if (juegoTerminado || puntuacion < 1000) return;
    if (Math.random() > 0.55) return; // ~45% de probabilidad cada 5 s

    const haciaLaDerecha = Math.random() > 0.5;
    const vel = 2.5 + Math.random() * 1.5;
    pajaros.push({
        x:    haciaLaDerecha ? -70 : canvas.width + 10,
        y:    50 + Math.random() * 130,
        ancho: 60, alto: 45,
        vel:  haciaLaDerecha ? vel : -vel,
        haciaLaDerecha,
        framesCacaRestantes: 60 + Math.floor(Math.random() * 80)
    });
}

function activarPajaro() {
    if (intervaloPajaro) return;
    intervaloPajaro = setInterval(crearPajaro, 5000);
}

// --- LEADERBOARD ---
async function guardarPuntuacion(nombre, puntos) {
    try {
        await db.collection("ecogum_leaderboard").add({
            nombre: nombre.trim().toUpperCase(),
            puntuacion: puntos,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Error guardando:", e); }
}

async function cargarRanking() {
    try {
        const snapshot = await db.collection("ecogum_leaderboard")
            .orderBy("puntuacion", "desc").limit(10).get();
        const lista = document.getElementById("listaRanking");
        lista.innerHTML = "";
        snapshot.forEach(doc => {
            const d = doc.data();
            const li = document.createElement("li");
            li.textContent = `${d.nombre} — ${d.puntuacion} pts`;
            lista.appendChild(li);
        });
        document.getElementById("ranking").classList.remove("oculto");
    } catch (e) { console.error("Error cargando ranking:", e); }
}

// --- OVERLAY GAME OVER ---
function mostrarGameOver() {
    document.getElementById("puntuacionFinal").textContent = `Puntuación: ${puntuacion}`;
    document.getElementById("formNombre").classList.remove("oculto");
    document.getElementById("ranking").classList.add("oculto");
    document.getElementById("inputNombre").value = "";
    document.getElementById("overlay").classList.remove("oculto");
    cargarRanking();
}

document.getElementById("btnGuardar").addEventListener("click", async () => {
    const nombre = document.getElementById("inputNombre").value.trim();
    if (!nombre) { document.getElementById("inputNombre").focus(); return; }
    document.getElementById("btnGuardar").disabled = true;
    document.getElementById("btnGuardar").textContent = "Guardando...";
    await guardarPuntuacion(nombre, puntuacion);
    await cargarRanking();
    document.getElementById("formNombre").classList.add("oculto");
    document.getElementById("btnGuardar").disabled = false;
    document.getElementById("btnGuardar").textContent = "💾 Guardar puntuación";
});

document.getElementById("btnReiniciar").addEventListener("click", () => {
    document.getElementById("overlay").classList.add("oculto");
    reiniciar();
});

// Mayúsculas automáticas al escribir el nombre (estilo arcade)
document.getElementById("inputNombre").addEventListener("input", function() {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
});

// --- REINICIO ---
function reiniciar() {
    puntuacion = 0; vidas = 3; nivelDificultad = 1;
    objetos = []; pajaros = []; cacas = [];
    pajaroActivado = false; juegoTerminado = false;

    if (intervaloObjetos) clearInterval(intervaloObjetos);
    if (intervaloPajaro)  clearInterval(intervaloPajaro);
    intervaloPajaro = null;

    intervaloObjetos = setInterval(crearObjeto, 1000);
    actualizar();
}

// --- BUCLE PRINCIPAL ---
function actualizar() {
    if (juegoTerminado) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.5;
    ctx.drawImage(assets.fondo, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;

    // Mover jugador
    if (jugador.movIzq && jugador.x > 0) jugador.x -= jugador.velocidad;
    if (jugador.movDer && jugador.x < canvas.width - jugador.ancho) jugador.x += jugador.velocidad;
    ctx.drawImage(assets.jugador, jugador.x, jugador.y, jugador.ancho, jugador.alto);

    // Activar pájaros al superar 1000 pts
    if (!pajaroActivado && puntuacion >= 1000) {
        pajaroActivado = true;
        activarPajaro();
    }

    // --- OBJETOS ---
    for (let i = 0; i < objetos.length; i++) {
        let o = objetos[i];
        o.y += o.vel;
        ctx.drawImage(o.tipo === 'hoja' ? assets.hoja : assets.chicle, o.x, o.y, o.ancho, o.alto);

        if (o.x < jugador.x + jugador.ancho && o.x + o.ancho > jugador.x &&
            o.y + o.alto > jugador.y && o.y < jugador.y + 20) {
            if (o.tipo === 'hoja') { puntuacion += 50; sonidoHoja(); }
            else                   { puntuacion += 10; sonidoChicle(); }
            objetos.splice(i, 1); i--;
        } else if (o.y > canvas.height) {
            if (o.tipo === 'chicle') { vidas--; sonidoCaida(); }
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            objetos.splice(i, 1); i--;
        }
    }

    // --- PÁJAROS ---
    for (let i = 0; i < pajaros.length; i++) {
        let b = pajaros[i];
        b.x += b.vel;

        // Dibujar (espejado si va hacia la izquierda)
        ctx.save();
        if (!b.haciaLaDerecha) {
            ctx.translate(b.x + b.ancho, b.y);
            ctx.scale(-1, 1);
            ctx.drawImage(assets.pajaro, 0, 0, b.ancho, b.alto);
        } else {
            ctx.drawImage(assets.pajaro, b.x, b.y, b.ancho, b.alto);
        }
        ctx.restore();

        // Soltar caca
        b.framesCacaRestantes--;
        if (b.framesCacaRestantes <= 0) {
            cacas.push({
                x: b.x + b.ancho / 2 - 8,
                y: b.y + b.alto,
                ancho: 16, alto: 20,
                vel: 3 + Math.random() * 2
            });
            b.framesCacaRestantes = 50 + Math.floor(Math.random() * 60);
        }

        // Eliminar si salió del canvas
        if (b.x > canvas.width + 80 || b.x < -80) {
            pajaros.splice(i, 1); i--;
        }
    }

    // --- CACAS ---
    for (let i = 0; i < cacas.length; i++) {
        let c = cacas[i];
        c.y += c.vel;
        ctx.drawImage(assets.caca, c.x, c.y, c.ancho, c.alto);

        // Colisión caca con jugador (hitbox completa del jugador)
        if (c.x < jugador.x + jugador.ancho && c.x + c.ancho > jugador.x &&
            c.y + c.alto > jugador.y && c.y < jugador.y + jugador.alto) {
            vidas--;
            sonidoCaca();
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            cacas.splice(i, 1); i--;
        } else if (c.y > canvas.height) {
            cacas.splice(i, 1); i--;
        }
    }

    // HUD
    ctx.textAlign = "left";
    ctx.fillStyle = "#333";
    ctx.font = "bold 18px Courier";
    ctx.fillText("Score: " + puntuacion, 10, 30);
    ctx.fillStyle = "#ff5c8d";
    ctx.fillText("Vidas: " + vidas, canvas.width - 100, 30);

    requestAnimationFrame(actualizar);
}

// --- INICIO ---
function iniciar() {
    if (intervaloObjetos) clearInterval(intervaloObjetos);
    intervaloObjetos = setInterval(crearObjeto, 1000);
    actualizar();
}
