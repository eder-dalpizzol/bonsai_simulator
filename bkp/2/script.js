import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- VARIÁVEIS GLOBAIS ---
let scene, camera, renderer, controls, tree;
let raycaster, mouse, highlightedObject; // Variáveis para o highlight

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

    // 6. Configuração do Raycaster para Highlight
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    highlightedObject = null;

    // 7. Loop de Animação
    animate();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', generateTreeFromInput);
    randomBtn.addEventListener('click', generateRandomTree);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown); // Listener para o clique (poda)

    // 9. Gerar a primeira árvore
    generateTree(parseInt(seedInput.value));
}

// --- LÓGICA DO HIGHLIGHT E PODA ---
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function onMouseDown(event) {
    if (event.target !== canvas) return;

    if (highlightedObject) {
        let objectToRemove = highlightedObject;

        if (highlightedObject.geometry.type === 'IcosahedronGeometry') {
            objectToRemove = highlightedObject.parent;
        }

        const { level, segmentIndex } = objectToRemove.userData;

        // Não permite remover a base do tronco principal
        if (level === 0 && segmentIndex === 0) {
            console.log("Não é possível podar a base do tronco principal.");
            return;
        }

        disposeOfObject(objectToRemove);
        highlightedObject = null;
    }
}

function checkHighlight() {
    if (!tree) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tree.children, true);

    if (highlightedObject) {
        highlightedObject.material.emissive.setHex(0x000000);
        highlightedObject = null;
    }

    const firstIntersect = intersects.find(intersect => 
        intersect.object.isMesh && 
        (intersect.object.geometry.type === 'CylinderGeometry' || intersect.object.geometry.type === 'IcosahedronGeometry')
    );

    if (firstIntersect) {
        highlightedObject = firstIntersect.object;
        highlightedObject.material.emissive.setHex(0xffff00);
    }
}

function disposeOfObject(obj) {
    obj.traverse(child => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    if (obj.parent) {
        obj.parent.remove(obj);
    }
}

// --- LÓGICA DA ÁRVORE ---

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
const SUBDIVISIONS = 3; // Número de segmentos por galho

function createBranch(parent, level, random) {
    if (level > MAX_LEVELS) return;

    const totalLength = 4 - level * 0.6;
    const radius = 0.2 - level * 0.035;
    const segmentLength = totalLength / SUBDIVISIONS;

    let currentParent = parent; // Começa como um pivô (Object3D)

    for (let i = 0; i < SUBDIVISIONS; i++) {
        const branchGeometry = new THREE.CylinderGeometry(radius, radius, segmentLength);
        const segment = new THREE.Mesh(branchGeometry, trunkMaterial.clone());
        segment.castShadow = true;

        // CORREÇÃO: O primeiro segmento é posicionado com a base no pivô.
        // Os seguintes são posicionados com a base no topo do segmento anterior.
        if (i === 0) {
            segment.position.y = segmentLength / 2; // Base no centro do pai (pivô)
        } else {
            segment.position.y = segmentLength / 2 + segmentLength / 2; // Base no topo do pai (outro segmento)
        }

        segment.userData = { level: level, segmentIndex: i };

        currentParent.add(segment);
        currentParent = segment; // O novo pai é o segmento que acabamos de criar
    }

    const topSegment = currentParent;

    if (level >= MAX_LEVELS - 2) {
        const leavesGeometry = new THREE.IcosahedronGeometry(1.5 - level * 0.2);
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial.clone());
        leaves.castShadow = true;
        leaves.position.y = segmentLength / 2; // Anexado ao topo do último segmento
        topSegment.add(leaves);
    }

    const numBranches = Math.floor(random() * 3) + 2;
    for (let i = 0; i < numBranches; i++) {
        const pivot = new THREE.Object3D();
        pivot.position.y = segmentLength / 2; // Anexado ao topo do último segmento
        pivot.rotation.x = (random() - 0.5) * Math.PI * 0.8;
        pivot.rotation.z = (random() - 0.5) * Math.PI * 0.8;
        topSegment.add(pivot);
        createBranch(pivot, level + 1, random);
    }
}

function generateTree(seed) {
    if (tree) {
        disposeOfObject(tree);
    }

    seedInput.value = seed;
    const random = mulberry32(seed);

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
    checkHighlight();
    renderer.render(scene, camera);
}

// --- INICIAR APLICAÇÃO ---
init();
