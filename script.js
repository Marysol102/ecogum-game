const canvas = document.getElementById("juegoCanvas");
const ctx = canvas.getContext("2d");

// --- ASSETS ---
const assets = {
    fondo:    new Image(),
    fondo2:   new Image(),
    jugador:  new Image(),
    chicle:   new Image(),
    hoja:     new Image(),
    pajaro:   new Image(),
    caca:     new Image(),
    patinete: new Image()
};

assets.fondo.src    = 'assets/fondo.png';
assets.fondo2.src   = 'assets/fondo2.png';
assets.jugador.src  = 'assets/personaje.png';
assets.chicle.src   = 'assets/chicle.png';
assets.hoja.src     = 'assets/hoja.png';
assets.pajaro.src   = 'assets/pajaro.png';
assets.caca.src     = 'assets/caca.png';
assets.patinete.src = 'assets/patinete.png';

let cargadas = 0;
const TOTAL_ASSETS = Object.keys(assets).length;
Object.values(assets).forEach(img => {
    img.onload  = () => { cargadas++; if (cargadas === TOTAL_ASSETS) iniciar(); };
    img.onerror = () => { cargadas++; if (cargadas === TOTAL_ASSETS) iniciar(); };
});

// --- AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function reproducirSonido(freq, tipo, dur, vol = 0.3, freqFinal = null) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (freqFinal !== null) osc.frequency.linearRampToValueAtTime(freqFinal, audioCtx.currentTime + dur);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur);
}

function sonidoChicle()   { reproducirSonido(520, 'square', 0.08, 0.25); }
function sonidoCaida()    { reproducirSonido(220, 'sawtooth', 0.18, 0.2, 80); }
function sonidoHoja()     { reproducirSonido(880, 'sine', 0.15, 0.3); setTimeout(() => reproducirSonido(1100, 'sine', 0.1, 0.15), 80); }
function sonidoCaca()     { reproducirSonido(300, 'sawtooth', 0.05, 0.4, 80); setTimeout(() => reproducirSonido(150, 'sawtooth', 0.12, 0.35, 60), 50); }
function sonidoSalto()    { reproducirSonido(280, 'sine', 0.12, 0.15, 480); }

function sonidoGraznido() {
    // Graznido sintetizado: oscilación rápida de frecuencia
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(350, audioCtx.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.16);
    osc.frequency.linearRampToValueAtTime(280, audioCtx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.32);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.32);
}

function sonidoPatinete() {
    // Ruido de ruedas: zumbido rápido ascendente
    reproducirSonido(120, 'sawtooth', 0.25, 0.2, 320);
    setTimeout(() => reproducirSonido(200, 'square', 0.15, 0.1, 80), 100);
}

// --- CONSTANTES DE FÍSICA ---
const SUELO      = 400;
const GRAVEDAD   = 0.6;
const FUERZA_SALTO = -13;

// --- VARIABLES ---
let puntuacion = 0;
let vidas = 3;
let juegoTerminado = false;
let objetos  = [];
let pajaros  = [];
let cacas    = [];
let patinetes = [];
let nivelDificultad = 1;
let fondoTransicion = 0;   // 0 = fondo1, 1 = fondo2 (se va llenando a partir de 1000 pts)
let pajaroActivado   = false;
let patineteActivado = false;
let intervaloObjetos = null;
let intervaloPajaro  = null;
let intervaloPatinete = null;

const jugador = {
    x: 170, y: SUELO, ancho: 60, alto: 80,
    velocidad: 8,
    movIzq: false, movDer: false,
    velY: 0,
    enSuelo: true
};

function saltar() {
    if (jugador.enSuelo) {
        jugador.velY = FUERZA_SALTO;
        jugador.enSuelo = false;
        sonidoSalto();
    }
}

// --- TECLADO ---
window.onkeydown = e => {
    if (e.key === "ArrowLeft")  jugador.movIzq = true;
    if (e.key === "ArrowRight") jugador.movDer = true;
    if (e.key === "ArrowUp")    saltar();
};
window.onkeyup = e => {
    if (e.key === "ArrowLeft")  jugador.movIzq = false;
    if (e.key === "ArrowRight") jugador.movDer = false;
};

// --- TÁCTIL ---
let touchStartY = 0;
let saltoTactilDisparado = false;

function obtenerPosicionToque(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
}

canvas.ontouchstart = e => {
    e.preventDefault();
    touchStartY = e.touches[0].clientY;
    saltoTactilDisparado = false;
    moverConDedo(e);
};

canvas.ontouchmove = e => {
    e.preventDefault();
    moverConDedo(e);
    // Salto si el dedo sube ≥ 40px sin soltarlo
    const dy = touchStartY - e.touches[0].clientY;
    if (dy >= 40 && !saltoTactilDisparado) {
        saltar();
        saltoTactilDisparado = true;
    }
};

function moverConDedo(e) {
    let nuevaX = obtenerPosicionToque(e) - jugador.ancho / 2;
    jugador.x = Math.max(0, Math.min(canvas.width - jugador.ancho, nuevaX));
}

// --- GENERACIÓN OBJETOS ---
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
    if (Math.random() > 0.55) return;

    const haciaLaDerecha = Math.random() > 0.5;
    const vel = 1.2 + Math.random() * 1.0; // más lento que antes
    pajaros.push({
        x:    haciaLaDerecha ? -70 : canvas.width + 10,
        y:    50 + Math.random() * 130,
        ancho: 60, alto: 45,
        vel:  haciaLaDerecha ? vel : -vel,
        haciaLaDerecha,
        framesCacaRestantes: 80 + Math.floor(Math.random() * 100)
    });
    sonidoGraznido();
}

function activarPajaro() {
    if (intervaloPajaro) return;
    intervaloPajaro = setInterval(crearPajaro, 5000);
}

// --- PATINETE ---
function crearPatinete() {
    if (juegoTerminado || puntuacion < 2000) return;
    if (Math.random() > 0.5) return; // ~50% de probabilidad cada llamada

    const haciaLaDerecha = Math.random() > 0.5;
    const vel = 2.5 + Math.random() * 1.5;
    patinetes.push({
        x:    haciaLaDerecha ? -100 : canvas.width + 10,
        y:    430,          // nivel del suelo, el jugador debe saltar para esquivarlo
        ancho: 90, alto: 40,
        vel:  haciaLaDerecha ? vel : -vel,
        haciaLaDerecha
    });
    sonidoPatinete();
}

function activarPatinete() {
    if (intervaloPatinete) return;
    intervaloPatinete = setInterval(crearPatinete, 6000);
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

document.getElementById("inputNombre").addEventListener("input", function() {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
});

// --- REINICIO ---
function reiniciar() {
    puntuacion = 0; vidas = 3; nivelDificultad = 1;
    fondoTransicion = 0;
    objetos = []; pajaros = []; cacas = []; patinetes = [];
    pajaroActivado = false; patineteActivado = false;
    juegoTerminado = false;

    jugador.x = 170; jugador.y = SUELO;
    jugador.velY = 0; jugador.enSuelo = true;
    jugador.movIzq = false; jugador.movDer = false;

    if (intervaloObjetos)  clearInterval(intervaloObjetos);
    if (intervaloPajaro)   clearInterval(intervaloPajaro);
    if (intervaloPatinete) clearInterval(intervaloPatinete);
    intervaloPajaro = null;
    intervaloPatinete = null;

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

    // FONDO con transición gradual a fondo2 a partir de 1000 pts
    if (puntuacion >= 1000 && fondoTransicion < 1) {
        // Transición completa en ~500 puntos (de 1000 a 1500)
        fondoTransicion = Math.min(1, (puntuacion - 1000) / 500);
    }
    ctx.globalAlpha = 0.5;
    ctx.drawImage(assets.fondo, 0, 0, canvas.width, canvas.height);
    if (fondoTransicion > 0) {
        ctx.globalAlpha = 0.5 * fondoTransicion;
        ctx.drawImage(assets.fondo2, 0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = 1.0;

    // JUGADOR — física de salto
    jugador.velY += GRAVEDAD;
    jugador.y += jugador.velY;
    if (jugador.y >= SUELO) {
        jugador.y = SUELO;
        jugador.velY = 0;
        jugador.enSuelo = true;
    }

    // Movimiento horizontal
    if (jugador.movIzq && jugador.x > 0) jugador.x -= jugador.velocidad;
    if (jugador.movDer && jugador.x < canvas.width - jugador.ancho) jugador.x += jugador.velocidad;

    ctx.drawImage(assets.jugador, jugador.x, jugador.y, jugador.ancho, jugador.alto);

    // Activar pájaro y patinete según puntuación
    if (!pajaroActivado && puntuacion >= 1000) {
        pajaroActivado = true;
        activarPajaro();
    }
    if (!patineteActivado && puntuacion >= 2000) {
        patineteActivado = true;
        activarPatinete();
    }

    // --- OBJETOS (chicles y hojas) ---
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
            b.framesCacaRestantes = 60 + Math.floor(Math.random() * 80);
        }

        if (b.x > canvas.width + 80 || b.x < -80) {
            pajaros.splice(i, 1); i--;
        }
    }

    // --- CACAS ---
    for (let i = 0; i < cacas.length; i++) {
        let c = cacas[i];
        c.y += c.vel;
        ctx.drawImage(assets.caca, c.x, c.y, c.ancho, c.alto);

        if (c.x < jugador.x + jugador.ancho && c.x + c.ancho > jugador.x &&
            c.y + c.alto > jugador.y && c.y < jugador.y + jugador.alto) {
            vidas--; sonidoCaca();
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            cacas.splice(i, 1); i--;
        } else if (c.y > canvas.height) {
            cacas.splice(i, 1); i--;
        }
    }

    // --- PATINETES ---
    for (let i = 0; i < patinetes.length; i++) {
        let p = patinetes[i];
        p.x += p.vel;

        ctx.save();
        if (!p.haciaLaDerecha) {
            ctx.translate(p.x + p.ancho, p.y);
            ctx.scale(-1, 1);
            ctx.drawImage(assets.patinete, 0, 0, p.ancho, p.alto);
        } else {
            ctx.drawImage(assets.patinete, p.x, p.y, p.ancho, p.alto);
        }
        ctx.restore();

        // Colisión: solo si el jugador NO ha saltado suficientemente alto
        // El patinete está en y=430, el jugador debe tener sus pies (y+alto) por encima de eso
        const jugadorPies = jugador.y + jugador.alto;
        if (p.x < jugador.x + jugador.ancho && p.x + p.ancho > jugador.x &&
            jugadorPies > p.y && jugador.y < p.y + p.alto) {
            vidas--; sonidoCaida();
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            patinetes.splice(i, 1); i--;
        } else if (p.x > canvas.width + 110 || p.x < -110) {
            patinetes.splice(i, 1); i--;
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
