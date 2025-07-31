import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- VARIÁVEIS GLOBAIS ---
let renderer, raycaster, mouse;
let treeScene, debugScene;
let treeCamera, debugCamera;
let treeControls, debugControls;
let activeControls;

let treeData = null, currentSeed = 0, prunedIds = new Set();
let branchTemplate = null, loadedFileInfo = {};
let highlightedObject = null;
let activeSceneKey = 'tree';

// --- ELEMENTOS DA UI ---
const ui = {
    treeControlsPanel: document.getElementById('tree-controls'),
    debugControlsPanel: document.getElementById('debug-controls'),
    seedInput: document.getElementById('seedInput'),
    generateBtn: document.getElementById('generateBtn'),
    randomBtn: document.getElementById('randomBtn'),
    copyLinkBtn: document.getElementById('copyLinkBtn'),
    saveBtn: document.getElementById('saveBtn'),
    loadInput: document.getElementById('loadInput'),
    debugModeBtn: document.getElementById('debugModeBtn'),
    treeModeBtn: document.getElementById('treeModeBtn'),
    modelInput: document.getElementById('modelInput'),
    useModelBtn: document.getElementById('useModelBtn'),
    infoFilename: document.getElementById('info-filename'),
    infoDims: document.getElementById('info-dims'),
    infoScale: document.getElementById('info-scale'),
    infoPivot: document.getElementById('info-pivot'),
};

// --- INICIALIZAÇÃO ---
function init() {
    const canvas = document.getElementById('main-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    setupTreeScene();
    setupDebugScene();
    setupEventListeners();

    switchMode('tree'); // Inicia no modo árvore
    loadStateFromURL();
    animate();
}

function setupTreeScene() {
    treeScene = new THREE.Scene();
    treeScene.background = new THREE.Color(0x87ceeb);
    treeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    treeCamera.position.set(15, 15, 15);
    treeControls = new OrbitControls(treeCamera, renderer.domElement);
    treeControls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0x666666);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 15, 10);
    directionalLight.castShadow = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshLambertMaterial({ color: 0x228b22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    treeScene.add(ambientLight, directionalLight, ground);
}

function setupDebugScene() {
    debugScene = new THREE.Scene();
    debugScene.background = new THREE.Color(0x333333);
    debugCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    debugCamera.position.set(1, 1, 1);
    debugControls = new OrbitControls(debugCamera, renderer.domElement);
    debugControls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xaaaaaa);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 1);
    const gridHelper = new THREE.GridHelper(2, 10);
    const axesHelper = new THREE.AxesHelper(1);
    debugScene.add(ambientLight, directionalLight, gridHelper, axesHelper);
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    ui.generateBtn.addEventListener('click', () => generateNewTree(parseInt(ui.seedInput.value)));
    ui.randomBtn.addEventListener('click', () => generateNewTree(Math.floor(Math.random() * 100000)));
    ui.copyLinkBtn.addEventListener('click', copyTreeLink);
    ui.saveBtn.addEventListener('click', saveTreeToFile);
    ui.loadInput.addEventListener('change', loadTreeFromFile);
    ui.debugModeBtn.addEventListener('click', () => switchMode('debug'));
    ui.treeModeBtn.addEventListener('click', () => switchMode('tree'));
    ui.modelInput.addEventListener('change', handleModelUpload);
    ui.useModelBtn.addEventListener('click', () => {
        branchTemplate = debugScene.getObjectByName("loadedModel");
        alert('Template do modelo atualizado!');
        switchMode('tree');
    });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
}

// --- LÓGICA DE MODO ---
function switchMode(mode) {
    activeSceneKey = mode;
    if (mode === 'tree') {
        ui.treeControlsPanel.classList.remove('hidden');
        ui.debugControlsPanel.classList.add('hidden');
        treeControls.enabled = true;
        debugControls.enabled = false;
        activeControls = treeControls;
    } else {
        ui.treeControlsPanel.classList.add('hidden');
        ui.debugControlsPanel.classList.remove('hidden');
        treeControls.enabled = false;
        debugControls.enabled = true;
        activeControls = debugControls;
    }
}

// --- LÓGICA DE DEPURAÇÃO ---
async function handleModelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
        const { model, info } = await loadAndNormalizeModel(url);
        loadedFileInfo = { ...info, filename: file.name };
        updateDebugInfo();
        const existingModel = debugScene.getObjectByName("loadedModel");
        if (existingModel) debugScene.remove(existingModel);
        model.name = "loadedModel";
        debugScene.add(model);
        ui.useModelBtn.disabled = false;
    } catch (error) { alert("Erro: " + error.message); }
    URL.revokeObjectURL(url);
    event.target.value = '';
}

function loadAndNormalizeModel(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
            let model = null;
            gltf.scene.traverse(child => { if (child.isMesh) model = child; });
            if (!model) return reject(new Error("Nenhuma malha (Mesh) encontrada."));

            const originalBox = new THREE.Box3().setFromObject(model);
            const originalSize = originalBox.getSize(new THREE.Vector3());
            if (originalSize.y === 0) return reject(new Error("Altura do modelo é 0."));

            const scaleFactor = 1.0 / originalSize.y;
            model.scale.set(scaleFactor, scaleFactor, scaleFactor);
            const scaledBox = new THREE.Box3().setFromObject(model);
            model.position.y = -scaledBox.min.y;
            model.material = new THREE.MeshLambertMaterial({ color: 0xcccccc });

            const info = {
                originalDims: `(${originalSize.x.toFixed(2)}, ${originalSize.y.toFixed(2)}, ${originalSize.z.toFixed(2)})`,
                scaleFactor: scaleFactor.toFixed(4),
                finalPivot: `(${model.position.x.toFixed(2)}, ${model.position.y.toFixed(2)}, ${model.position.z.toFixed(2)})`
            };
            resolve({ model, info });
        }, undefined, () => reject(new Error("Falha ao carregar arquivo GLB.")));
    });
}

function updateDebugInfo() {
    ui.infoFilename.textContent = loadedFileInfo.filename || 'Nenhum';
    ui.infoDims.textContent = loadedFileInfo.originalDims || 'N/A';
    ui.infoScale.textContent = loadedFileInfo.scaleFactor || 'N/A';
    ui.infoPivot.textContent = loadedFileInfo.finalPivot || 'N/A';
}

// --- LÓGICA DE GERAÇÃO DA ÁRVORE ---
function generateNewTree(seed, initialPrunedIds = new Set()) {
    if (isNaN(seed)) return;
    currentSeed = seed;
    prunedIds = initialPrunedIds;
    ui.seedInput.value = currentSeed;
    const random = new Mulberry32(currentSeed);
    let idCounter = 0;
    treeData = generateBranchData(null, 0, random, () => idCounter++);
    buildTreeView();
}

function buildTreeView() {
    const existingTree = treeScene.getObjectByName("tree");
    if (existingTree) disposeOfObject(existingTree);
    const treeObject = new THREE.Object3D();
    treeObject.name = "tree";
    buildMeshFromData(treeObject, treeData, prunedIds);
    treeScene.add(treeObject);
    updateURL();
}

function generateBranchData(parentData, level, random, getId) {
    if (level > 5) return null;
    const branchData = { id: getId(), level, children: [] };
    branchData.segments = Array.from({ length: 3 }, (_, i) => ({ id: getId(), level, segmentIndex: i }));
    if (level >= 3) branchData.leaf = { id: getId() };
    const numBranches = Math.floor(random.next() * 3) + 2;
    for (let i = 0; i < numBranches; i++) {
        const childData = generateBranchData(branchData, level + 1, random, getId);
        if (childData) {
            childData.rotation = { x: (random.next() - 0.5) * Math.PI * 0.8, z: (random.next() - 0.5) * Math.PI * 0.8 };
            branchData.children.push(childData);
        }
    }
    return branchData;
}

const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 });

function buildMeshFromData(parent, data, idsToSkip) {
    if (idsToSkip.has(data.id)) return;

    const totalLength = 4 - data.level * 0.6;
    const radius = 0.2 - data.level * 0.035;
    const segmentLength = totalLength / 3;

    let currentParent = parent;
    let topPosition; // Variável para armazenar a posição do topo do último segmento

    for (const segmentData of data.segments) {
        if (idsToSkip.has(segmentData.id)) continue;

        let segment;
        if (branchTemplate) {
            // Lógica para o modelo 3D com pivô na base
            segment = branchTemplate.clone();
            segment.material = branchTemplate.material.clone();
            segment.scale.set(radius * 2, segmentLength, radius * 2);
            segment.position.y = (segmentData.segmentIndex === 0) ? 0 : segmentLength;
            topPosition = segmentLength; // O topo de um modelo com base na origem é sua altura total
        } else {
            // Lógica para o cilindro padrão com pivô no centro
            segment = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, segmentLength),
                new THREE.MeshLambertMaterial({ color: 0x8b4513 })
            );
            segment.position.y = (segmentData.segmentIndex === 0) ? segmentLength / 2 : segmentLength;
            topPosition = segmentLength / 2; // O topo de um cilindro com pivô no centro é metade de sua altura
        }

        segment.castShadow = true;
        segment.userData = segmentData;
        currentParent.add(segment);
        currentParent = segment;
    }

    // Se todos os segmentos foram pulados, não continue.
    if (currentParent === parent) return;

    if (data.leaf && !idsToSkip.has(data.leaf.id)) {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 - data.level * 0.2), leavesMaterial.clone());
        leaves.castShadow = true;
        leaves.position.y = topPosition;
        leaves.userData = { id: data.leaf.id };
        currentParent.add(leaves);
    }

    for (const childData of data.children) {
        const pivot = new THREE.Object3D();
        pivot.position.y = topPosition;
        pivot.rotation.x = childData.rotation.x;
        pivot.rotation.z = childData.rotation.z;
        currentParent.add(pivot);
        buildMeshFromData(pivot, childData, idsToSkip);
    }
}

// --- LÓGICA DE INTERAÇÃO E ESTADO ---
function onMouseDown(event) {
    if (activeSceneKey !== 'tree' || event.button !== 0) return;
    if (highlightedObject) {
        const id = highlightedObject.userData.id;
        const isLeaf = highlightedObject.geometry.type === 'IcosahedronGeometry';
        if (isLeaf) {
            prunedIds.add(id);
        } else {
            const { branch } = findNodeById(treeData, id);
            if (branch && branch.level > 0) addBranchIdsToPruneSet(branch);
        }
        buildTreeView();
        highlightedObject = null;
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
        if (parts[1] && parts[1].length) ids = parts[1].split(',').map(Number);
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

// --- LOOP DE ANIMAÇÃO E FUNÇÕES AUXILIARES ---

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function checkHighlight() {
    if (activeSceneKey !== 'tree') return;
    raycaster.setFromCamera(mouse, treeCamera);
    const treeObject = treeScene.getObjectByName("tree");
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
    if(obj.parent) obj.parent.remove(obj);
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    treeCamera.aspect = width / height;
    treeCamera.updateProjectionMatrix();
    debugCamera.aspect = width / height;
    debugCamera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);
    activeControls.update();
    if (activeSceneKey === 'tree') {
        checkHighlight();
        renderer.render(treeScene, treeCamera);
    } else {
        renderer.render(debugScene, debugCamera);
    }
}

function Mulberry32(seed) {
    this.a = seed;
    this.next = function() { var t = this.a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// --- INICIAR APLICAÇÃO ---
init();
