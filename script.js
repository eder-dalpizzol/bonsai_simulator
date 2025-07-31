import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- VARIÁVEIS GLOBAIS DE ESTADO ---
let scene, camera, renderer, controls;
let raycaster, mouse, highlightedObject;

// Estado da Árvore
let treeData = null; // A "planta" da árvore, baseada na semente.
let currentSeed = 0;
let prunedIds = new Set();

// --- ELEMENTOS DA UI ---
const canvas = document.getElementById('c');
const seedInput = document.getElementById('seedInput');
const generateBtn = document.getElementById('generateBtn');
const randomBtn = document.getElementById('randomBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const saveBtn = document.getElementById('saveBtn');
const loadInput = document.getElementById('loadInput');

// --- INICIALIZAÇÃO ---
function init() {
    setupScene();
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    animate();
    setupEventListeners();
    loadStateFromURL();
}

function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const ambientLight = new THREE.AmbientLight(0x666666);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', () => generateNewTree(parseInt(seedInput.value)));
    randomBtn.addEventListener('click', () => generateNewTree(Math.floor(Math.random() * 100000)));
    copyLinkBtn.addEventListener('click', copyTreeLink);
    saveBtn.addEventListener('click', saveTreeToFile);
    loadInput.addEventListener('change', loadTreeFromFile);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
}

// --- LÓGICA DE GERAÇÃO (DADOS -> VISUALIZAÇÃO) ---

// Gera uma nova "planta" e a visualização
function generateNewTree(seed, initialPrunedIds = new Set()) {
    if (isNaN(seed)) return;
    currentSeed = seed;
    prunedIds = initialPrunedIds;
    seedInput.value = currentSeed;

    // FASE 1: Gerar a estrutura de dados (a "planta")
    const random = new Mulberry32(currentSeed);
    let idCounter = 0;
    treeData = generateBranchData(null, 0, random, () => idCounter++);

    // FASE 2: Construir a visualização a partir dos dados
    buildTreeView();
}

// Apenas reconstrói a visualização a partir dos dados existentes
function buildTreeView() {
    const existingTree = scene.getObjectByName("tree");
    if (existingTree) {
        disposeOfObject(existingTree);
    }

    const treeObject = new THREE.Object3D();
    treeObject.name = "tree";
    buildMeshFromData(treeObject, treeData, prunedIds);
    scene.add(treeObject);
    updateURL();
}

// --- FASE 1: GERAR A "PLANTA" DA ÁRVORE ---

function generateBranchData(parentData, level, random, getId) {
    if (level > 5) return null;

    const branchData = { id: getId(), level, children: [] };

    const numSegments = 3;
    branchData.segments = [];
    for (let i = 0; i < numSegments; i++) {
        branchData.segments.push({ id: getId(), level, segmentIndex: i });
    }

    if (level >= 3) {
        branchData.leaf = { id: getId() };
    }

    const numBranches = Math.floor(random.next() * 3) + 2;
    for (let i = 0; i < numBranches; i++) {
        const childData = generateBranchData(branchData, level + 1, random, getId);
        if (childData) {
            childData.rotation = {
                x: (random.next() - 0.5) * Math.PI * 0.8,
                z: (random.next() - 0.5) * Math.PI * 0.8
            };
            branchData.children.push(childData);
        }
    }
    return branchData;
}

// --- FASE 2: CONSTRUIR O MODELO 3D A PARTIR DOS DADOS ---

const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 });

function buildMeshFromData(parent, data, idsToSkip) {
    if (idsToSkip.has(data.id)) return;

    const totalLength = 4 - data.level * 0.6;
    const radius = 0.2 - data.level * 0.035;
    const segmentLength = totalLength / 3;

    let currentParent = parent;
    for (const segmentData of data.segments) {
        if (idsToSkip.has(segmentData.id)) continue;
        const segment = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, segmentLength),
            trunkMaterial.clone()
        );
        segment.castShadow = true;
        segment.position.y = (segmentData.segmentIndex === 0) ? segmentLength / 2 : segmentLength;
        segment.userData = segmentData;
        currentParent.add(segment);
        currentParent = segment;
    }

    if (data.leaf && !idsToSkip.has(data.leaf.id)) {
        const leaves = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.5 - data.level * 0.2),
            leavesMaterial.clone()
        );
        leaves.castShadow = true;
        leaves.position.y = segmentLength / 2;
        leaves.userData = { id: data.leaf.id };
        currentParent.add(leaves);
    }

    for (const childData of data.children) {
        const pivot = new THREE.Object3D();
        pivot.position.y = segmentLength / 2;
        pivot.rotation.x = childData.rotation.x;
        pivot.rotation.z = childData.rotation.z;
        currentParent.add(pivot);
        buildMeshFromData(pivot, childData, idsToSkip);
    }
}

// --- LÓGICA DE INTERAÇÃO E ESTADO ---

function onMouseDown(event) {
    if (event.button !== 0 || event.target !== canvas) return;

    if (highlightedObject) {
        const id = highlightedObject.userData.id;
        const type = highlightedObject.geometry.type;

        // CASO 1: Clicou em uma folha. Remove apenas a folha.
        if (type === 'IcosahedronGeometry') {
            prunedIds.add(id);
            buildTreeView();
            highlightedObject = null;
            return; // Fim da operação
        }

        // CASO 2: Clicou em um galho. Remove o galho inteiro.
        if (type === 'CylinderGeometry') {
            const { branch } = findNodeById(treeData, id);

            if (branch) {
                // Regra para não podar o tronco principal
                if (branch.level === 0) {
                    console.log("Não é possível podar o tronco principal.");
                    return;
                }
                addBranchIdsToPruneSet(branch);
                buildTreeView();
                highlightedObject = null;
            }
        }
    }
}

function addBranchIdsToPruneSet(branchData) {
    if (!branchData) return;
    prunedIds.add(branchData.id);
    if (branchData.leaf) prunedIds.add(branchData.leaf.id);
    if (branchData.segments) branchData.segments.forEach(s => prunedIds.add(s.id));
    if (branchData.children) branchData.children.forEach(addBranchIdsToPruneSet);
}

function findNodeById(data, id) {
    if (!data) return {};
    if (data.id === id) return { branch: data };
    if (data.leaf && data.leaf.id === id) return { branch: data };
    if (data.segments) {
        const segment = data.segments.find(s => s.id === id);
        if (segment) return { branch: data, segment };
    }
    if (data.children) {
        for (const child of data.children) {
            const found = findNodeById(child, id);
            if (found.branch) return found;
        }
    }
    return {};
}

function loadStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const state = urlParams.get('state');
    let seed = 12345;
    let ids = [];
    if (state) {
        const parts = state.split('_p');
        seed = parseInt(parts[0]);
        if (parts[1] && parts[1].length) {
            ids = parts[1].split(',').map(Number);
        }
    }
    generateNewTree(seed, new Set(ids));
}

function updateURL() {
    const stateString = `${currentSeed}_p${Array.from(prunedIds).join(',')}`;
    const url = new URL(window.location);
    url.searchParams.set('state', stateString);
    window.history.replaceState({}, '', url);
}

function copyTreeLink() {
    updateURL();
    navigator.clipboard.writeText(window.location.href).then(() => alert('Link copiado!'));
}

function saveTreeToFile() {
    const state = { seed: currentSeed, pruned: Array.from(prunedIds) };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tree-state-${currentSeed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function loadTreeFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);
            if (typeof state.seed === 'number' && Array.isArray(state.pruned)) {
                generateNewTree(state.seed, new Set(state.pruned));
            } else { alert('Arquivo JSON inválido.'); }
        } catch (error) { alert('Erro ao ler o arquivo.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- FUNÇÕES AUXILIARES E LOOP DE ANIMAÇÃO ---

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function checkHighlight() {
    raycaster.setFromCamera(mouse, camera);
    const treeObject = scene.getObjectByName("tree");
    if (!treeObject) return;

    const intersects = raycaster.intersectObjects(treeObject.children, true);
    if (highlightedObject) {
        highlightedObject.material.emissive.setHex(0x000000);
        highlightedObject = null;
    }
    const firstIntersect = intersects.find(i => i.object.isMesh && i.object.userData.id !== undefined);
    if (firstIntersect) {
        highlightedObject = firstIntersect.object;
        highlightedObject.material.emissive.setHex(0xffff00);
    }
}

function disposeOfObject(obj) {
    obj.traverse(child => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
    obj.parent.remove(obj);
}

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

function Mulberry32(seed) {
    this.a = seed;
    this.next = function() { var t = this.a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// --- INICIAR APLICAÇÃO ---
init();