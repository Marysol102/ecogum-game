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

// --- VARIABLES DEL JUEGO ---
let puntuacion = 0;
let vidas = 3;
let juegoTerminado = false;
let objetos = [];
let nivelDificultad = 1;

const jugador = {
    x: 170, y: 400, ancho: 60, alto: 80,
    velocidad: 8, movIzq: false, movDer: false
};

// --- CONTROLES DE TECLADO (PC) ---
window.onkeydown = e => {
    if(e.key === "ArrowLeft") jugador.movIzq = true;
    if(e.key === "ArrowRight") jugador.movDer = true;
};
window.onkeyup = e => {
    if(e.key === "ArrowLeft") jugador.movIzq = false;
    if(e.key === "ArrowRight") jugador.movDer = false;
};

// --- CONTROLES TÁCTILES (MÓVIL - SEGUIMIENTO DE DEDO) ---

// Función común para obtener la X del toque adaptada al canvas
function obtenerPosicionToque(e) {
    const rect = canvas.getBoundingClientRect();
    const clienteX = e.touches[0].clientX;
    // Calculamos la posición relativa al canvas y escalamos según el tamaño visual
    return (clienteX - rect.left) * (canvas.width / rect.width);
}

canvas.ontouchstart = e => {
    if (juegoTerminado) { reiniciar(); return; }
    e.preventDefault(); // Evita scroll o zoom accidental
    moverConDedo(e);
};

canvas.ontouchmove = e => {
    e.preventDefault();
    moverConDedo(e);
};

function moverConDedo(e) {
    const xRelativa = obtenerPosicionToque(e);
    // Centramos el personaje bajo el dedo
    let nuevaX = xRelativa - jugador.ancho / 2;
    
    // Limitamos para que no se salga de los bordes del canvas
    if (nuevaX < 0) nuevaX = 0;
    if (nuevaX > canvas.width - jugador.ancho) nuevaX = canvas.width - jugador.ancho;
    
    jugador.x = nuevaX;
}

// --- LÓGICA DE GENERACIÓN ---
function crearObjeto() {
    if (juegoTerminado) return;
    nivelDificultad = 1 + Math.floor(puntuacion / 100) * 0.06;

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

function reiniciar() {
    puntuacion = 0; vidas = 3; objetos = [];
    nivelDificultad = 1;
    juegoTerminado = false; actualizar();
}

// --- BUCLE PRINCIPAL ---
function actualizar() {
    if (juegoTerminado) {
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff5c8d";
        ctx.textAlign = "center";
        ctx.font = "bold 30px Courier";
        ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2);
        ctx.fillStyle = "white";
        ctx.font = "16px Courier";
        ctx.fillText("Toca para reiniciar", canvas.width/2, canvas.height/2 + 40);
        return;
    }

    ctx.clearRect(0,0, canvas.width, canvas.height);
    
    ctx.globalAlpha = 0.5;
    ctx.drawImage(assets.fondo, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;

    // Movimiento por teclado (solo aplica si no se está usando el táctil)
    if (jugador.movIzq && jugador.x > 0) jugador.x -= jugador.velocidad;
    if (jugador.movDer && jugador.x < canvas.width - jugador.ancho) jugador.x += jugador.velocidad;

    ctx.drawImage(assets.jugador, jugador.x, jugador.y, jugador.ancho, jugador.alto);

    for (let i = 0; i < objetos.length; i++) {
        let o = objetos[i];
        o.y += o.vel;
        const img = o.tipo === 'hoja' ? assets.hoja : assets.chicle;
        ctx.drawImage(img, o.x, o.y, o.ancho, o.alto);

        if (o.x < jugador.x + jugador.ancho && o.x + o.ancho > jugador.x &&
            o.y + o.alto > jugador.y && o.y < jugador.y + 20) {
            puntuacion += (o.tipo === 'hoja' ? 50 : 10);
            objetos.splice(i, 1); i--;
        } 
        else if (o.y > canvas.height) {
            if (o.tipo === 'chicle') vidas--;
            if (vidas <= 0) juegoTerminado = true;
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

function iniciar() {
    setInterval(crearObjeto, 1000);
    actualizar();
}
