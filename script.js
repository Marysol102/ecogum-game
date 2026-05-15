const canvas = document.getElementById("juegoCanvas");
const ctx = canvas.getContext("2d");

// --- CONFIGURACIÓN DE IMÁGENES ---
const assets = {
    fondo: new Image(),
    jugador: new Image(),
    chicle: new Image(),
    hoja: new Image()
};

assets.fondo.src = 'assets/fondo.png';
assets.jugador.src = 'assets/personaje.png';
assets.chicle.src = 'assets/chicle.png';
assets.hoja.src = 'assets/hoja.png';

let cargadas = 0;
Object.values(assets).forEach(img => {
    img.onload = () => {
        cargadas++;
        if (cargadas === 4) iniciar();
    };
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
    if (frecFinal !== null) {
        osc.frequency.linearRampToValueAtTime(frecFinal, audioCtx.currentTime + duracion);
    }
    gain.gain.setValueAtTime(volumen, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracion);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duracion);
}

// Sonido: recoges chicle — pip corto y alegre
function sonidoChicle() {
    reproducirSonido(520, 'square', 0.08, 0.25);
}

// Sonido: chicle cae al suelo — tono grave descendente (penalización)
function sonidoCaida() {
    reproducirSonido(220, 'sawtooth', 0.18, 0.2, 80);
}

// Sonido: recoges hoja — chime brillante (bonus)
function sonidoHoja() {
    reproducirSonido(880, 'sine', 0.15, 0.3);
    setTimeout(() => reproducirSonido(1100, 'sine', 0.1, 0.15), 80);
}

// --- VARIABLES DEL JUEGO ---
let puntuacion = 0;
let vidas = 3;
let juegoTerminado = false;
let objetos = [];
let nivelDificultad = 1;
let intervaloObjetos = null; // ← referencia al setInterval para poder cancelarlo

const jugador = {
    x: 170, y: 400, ancho: 60, alto: 80,
    velocidad: 8, movIzq: false, movDer: false
};

// --- CONTROLES DE TECLADO (PC) ---
window.onkeydown = e => {
    if (e.key === "ArrowLeft") jugador.movIzq = true;
    if (e.key === "ArrowRight") jugador.movDer = true;
};
window.onkeyup = e => {
    if (e.key === "ArrowLeft") jugador.movIzq = false;
    if (e.key === "ArrowRight") jugador.movDer = false;
};

// --- CONTROLES TÁCTILES (MÓVIL) ---
function obtenerPosicionToque(e) {
    const rect = canvas.getBoundingClientRect();
    const clienteX = e.touches[0].clientX;
    return (clienteX - rect.left) * (canvas.width / rect.width);
}

canvas.ontouchstart = e => {
    e.preventDefault();
    moverConDedo(e);
};
canvas.ontouchmove = e => {
    e.preventDefault();
    moverConDedo(e);
};

function moverConDedo(e) {
    const xRelativa = obtenerPosicionToque(e);
    let nuevaX = xRelativa - jugador.ancho / 2;
    if (nuevaX < 0) nuevaX = 0;
    if (nuevaX > canvas.width - jugador.ancho) nuevaX = canvas.width - jugador.ancho;
    jugador.x = nuevaX;
}

// --- LÓGICA DE GENERACIÓN ---
function crearObjeto() {
    if (juegoTerminado) return;
    nivelDificultad = 1 + Math.floor(puntuacion / 100) * 0.1; // ← cambiado de 0.06 a 0.1

    const generarIndividual = () => {
        const tipo = Math.random() > 0.85 ? 'hoja' : 'chicle';
        objetos.push({
            x: Math.random() * (canvas.width - 30),
            y: -30, ancho: 25, alto: 25,
            vel: (1 + Math.random() * 1) * nivelDificultad,
            tipo: tipo
        });
    };

    generarIndividual();
    if (Math.random() > 0.85) {
        setTimeout(generarIndividual, 150);
    }
}

// --- LEADERBOARD (Firebase Firestore) ---
async function guardarPuntuacion(nombre, puntos) {
    try {
        await db.collection("ecogum_leaderboard").add({
            nombre: nombre.trim(),
            puntuacion: puntos,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("Error guardando puntuación:", e);
    }
}

async function cargarRanking() {
    try {
        const snapshot = await db.collection("ecogum_leaderboard")
            .orderBy("puntuacion", "desc")
            .limit(10)
            .get();

        const lista = document.getElementById("listaRanking");
        lista.innerHTML = "";
        snapshot.forEach(doc => {
            const d = doc.data();
            const li = document.createElement("li");
            li.textContent = `${d.nombre} — ${d.puntuacion} pts`;
            lista.appendChild(li);
        });

        document.getElementById("ranking").classList.remove("oculto");
    } catch (e) {
        console.error("Error cargando ranking:", e);
    }
}

// --- OVERLAY DE GAME OVER ---
function mostrarGameOver() {
    document.getElementById("puntuacionFinal").textContent = `Puntuación: ${puntuacion}`;
    document.getElementById("formNombre").classList.remove("oculto");
    document.getElementById("ranking").classList.add("oculto");
    document.getElementById("inputNombre").value = "";
    document.getElementById("overlay").classList.remove("oculto");

    // Cargar ranking al mostrar el overlay
    cargarRanking();
}

document.getElementById("btnGuardar").addEventListener("click", async () => {
    const nombre = document.getElementById("inputNombre").value.trim();
    if (!nombre) {
        document.getElementById("inputNombre").focus();
        return;
    }
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

// --- REINICIO ---
function reiniciar() {
    puntuacion = 0;
    vidas = 3;
    objetos = [];
    nivelDificultad = 1;
    juegoTerminado = false;

    // Cancelar intervalo anterior y crear uno nuevo limpio
    if (intervaloObjetos) clearInterval(intervaloObjetos);
    intervaloObjetos = setInterval(crearObjeto, 1000);

    actualizar();
}

// --- BUCLE PRINCIPAL ---
function actualizar() {
    if (juegoTerminado) {
        // Fondo oscuro en canvas mientras el overlay HTML está encima
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.5;
    ctx.drawImage(assets.fondo, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;

    if (jugador.movIzq && jugador.x > 0) jugador.x -= jugador.velocidad;
    if (jugador.movDer && jugador.x < canvas.width - jugador.ancho) jugador.x += jugador.velocidad;

    ctx.drawImage(assets.jugador, jugador.x, jugador.y, jugador.ancho, jugador.alto);

    for (let i = 0; i < objetos.length; i++) {
        let o = objetos[i];
        o.y += o.vel;
        const img = o.tipo === 'hoja' ? assets.hoja : assets.chicle;
        ctx.drawImage(img, o.x, o.y, o.ancho, o.alto);

        // Colisión con el jugador
        if (o.x < jugador.x + jugador.ancho && o.x + o.ancho > jugador.x &&
            o.y + o.alto > jugador.y && o.y < jugador.y + 20) {

            if (o.tipo === 'hoja') {
                puntuacion += 50;
                sonidoHoja();
            } else {
                puntuacion += 10;
                sonidoChicle();
            }
            objetos.splice(i, 1); i--;

        } else if (o.y > canvas.height) {
            if (o.tipo === 'chicle') {
                vidas--;
                sonidoCaida();
            }
            if (vidas <= 0) {
                juegoTerminado = true;
                mostrarGameOver();
            }
            objetos.splice(i, 1); i--;
        }
    }

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
