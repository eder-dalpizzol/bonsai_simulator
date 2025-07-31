import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- VARIÁVEIS GLOBAIS ---
let scene, camera, renderer, controls, tree;

// --- ELEMENTOS DA UI ---
const canvas = document.getElementById('c');
const seedInput = document.getElementById('seedInput');
const generateBtn = document.getElementById('generateBtn');
const randomBtn = document.getElementById('randomBtn');

// --- INICIALIZAÇÃO ---
function init() {
    // 1. Cena e Câmera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(10, 10, 10);

    // 2. Renderizador
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // 3. Controles de Câmera
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // 4. Luzes
    const ambientLight = new THREE.AmbientLight(0x666666);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // 5. Chão
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 6. Loop de Animação
    animate();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', generateTreeFromInput);
    randomBtn.addEventListener('click', generateRandomTree);

    // 8. Gerar a primeira árvore
    generateTree(parseInt(seedInput.value));
}

// --- LÓGICA DA ÁRVORE ---

// Gerador de números pseudo-aleatórios (PRNG)
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 });
const MAX_LEVELS = 5;

function createBranch(parent, level, random) {
    if (level > MAX_LEVELS) return;

    const length = 4 - level * 0.6;
    const radius = 0.2 - level * 0.035;

    const branchGeometry = new THREE.CylinderGeometry(radius, radius, length);
    const branch = new THREE.Mesh(branchGeometry, trunkMaterial);
    branch.castShadow = true;
    branch.position.y = length / 2;
    parent.add(branch);

    if (level >= MAX_LEVELS - 2) {
        const leavesGeometry = new THREE.IcosahedronGeometry(1.5 - level * 0.2);
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.castShadow = true;
        leaves.position.y = length / 2;
        branch.add(leaves);
    }

    const numBranches = Math.floor(random() * 3) + 2;
    for (let i = 0; i < numBranches; i++) {
        const pivot = new THREE.Object3D();
        pivot.position.y = length / 2;
        pivot.rotation.x = (random() - 0.5) * Math.PI * 0.8;
        pivot.rotation.z = (random() - 0.5) * Math.PI * 0.8;
        branch.add(pivot);
        createBranch(pivot, level + 1, random);
    }
}

function generateTree(seed) {
    // Se já existe uma árvore, remove-a da cena
    if (tree) {
        scene.remove(tree);
    }

    // Atualiza o valor no input
    seedInput.value = seed;

    // Cria a função de aleatoriedade com a nova semente
    const random = mulberry32(seed);

    // Cria o objeto da árvore e inicia a geração
    tree = new THREE.Object3D();
    tree.position.y = 0;
    scene.add(tree);
    createBranch(tree, 0, random);
}

function generateTreeFromInput() {
    const seed = parseInt(seedInput.value);
    if (!isNaN(seed)) {
        generateTree(seed);
    }
}

function generateRandomTree() {
    const randomSeed = Math.floor(Math.random() * 100000);
    generateTree(randomSeed);
}

// --- FUNÇÕES AUXILIARES ---

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- INICIAR APLICAÇÃO ---
init();
