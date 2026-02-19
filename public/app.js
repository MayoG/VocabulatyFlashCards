// CSV file directory
const DATA_DIR = 'data';

// State
let categories = [];
let currentCategory = null;
let currentWords = [];
let currentCardIndex = 0;
let isFlipped = false;
let randomOrder = [];
let touchStartX = 0;
let touchEndX = 0;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
});

// Setup swipe gestures for mobile
function setupSwipeGestures() {
    const flashcard = document.getElementById('flashcard');
    if (!flashcard) return;
    
    // Remove existing listeners if any
    flashcard.removeEventListener('touchstart', handleTouchStart);
    flashcard.removeEventListener('touchend', handleTouchEnd);
    
    // Add new listeners
    flashcard.addEventListener('touchstart', handleTouchStart, { passive: true });
    flashcard.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
}

function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}

// Handle swipe gesture
function handleSwipe() {
    const swipeThreshold = 50; // Minimum distance for swipe
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swipe left - next card
            nextCard();
        } else {
            // Swipe right - previous card
            previousCard();
        }
    }
}

// Screen navigation
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'studyMenu') {
        loadCategories();
    }
}

// Parse CSV text to array of objects
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return []; // Need at least header + one data row
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let currentValue = '';
        let inQuotes = false;
        
        // Handle CSV parsing with quoted values
        for (let j = 0; j < lines[i].length; j++) {
            const char = lines[i][j];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim()); // Add last value
        
        if (values.length === headers.length) {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header.toLowerCase()] = values[index];
            });
            data.push(obj);
        }
    }
    
    return data;
}

// Load categories by checking available CSV files
async function loadCategories() {
    try {
        // Try to fetch a categories list file, or scan known categories
        // For now, we'll define categories in a config or try common ones
        // You can manually add categories here or create a categories.json file
        const categoryNames = await getCategoryNames();
        categories = categoryNames;
        displayCategories();
    } catch (error) {
        console.error('Error loading categories:', error);
        displayCategories();
    }
}

// Get category names - tries to fetch known categories or reads from a config
async function getCategoryNames() {
    // Option 1: Try to read a categories.json file
    try {
        const response = await fetch(`${DATA_DIR}/categories.json`);
        if (response.ok) {
            const data = await response.json();
            return data.categories || [];
        }
    } catch (e) {
        // If no categories.json, we'll scan for CSV files
        // Since we can't list directory in browser, we'll use a predefined list
        // You can manually update this array or create categories.json
    }
    
    // Option 2: Try common category names
    const commonCategories = ['greetings', 'food', 'colors', 'numbers', 'animals'];
    const foundCategories = [];
    
    for (const cat of commonCategories) {
        try {
            const response = await fetch(`${DATA_DIR}/${cat}.csv`);
            if (response.ok) {
                foundCategories.push(cat);
            }
        } catch (e) {
            // Category doesn't exist
        }
    }
    
    return foundCategories;
}

// Display categories for study
function displayCategories() {
    const container = document.getElementById('categoryList');
    if (categories.length === 0) {
        container.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">No categories found. Please add CSV files to the data folder.</div>';
        return;
    }
    
    // Add "All Categories" option at the top
    let html = `
        <div class="category-item" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); font-weight: 600; border: 2px solid white;" onclick="startStudyAll()">
            📚 All Categories (${categories.length})
        </div>
    `;
    
    // Add individual categories
    html += categories.map(cat => `
        <div class="category-item" onclick="startStudy('${cat}')">
            ${cat.charAt(0).toUpperCase() + cat.slice(1)}
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Start studying all categories
async function startStudyAll() {
    try {
        currentCategory = 'all';
        currentWords = [];
        
        // Load words from all categories
        for (const category of categories) {
            try {
                const response = await fetch(`${DATA_DIR}/${category}.csv`);
                if (response.ok) {
                    const csvText = await response.text();
                    const words = parseCSV(csvText);
                    currentWords = currentWords.concat(words);
                }
            } catch (error) {
                console.warn(`Failed to load category ${category}:`, error);
            }
        }
        
        if (currentWords.length === 0) {
            alert('No words found in any category!');
            return;
        }
        
        // Randomize order
        randomOrder = [...Array(currentWords.length).keys()].sort(() => Math.random() - 0.5);
        currentCardIndex = 0;
        isFlipped = false;
        
        showScreen('flashcardView');
        setupSwipeGestures();
        updateCard();
    } catch (error) {
        console.error('Error loading words:', error);
        alert('Error loading words. Please make sure the CSV files exist in the data folder.');
    }
}

// Start studying a category
async function startStudy(category) {
    try {
        currentCategory = category;
        const response = await fetch(`${DATA_DIR}/${category}.csv`);
        
        if (!response.ok) {
            throw new Error(`Failed to load category: ${response.statusText}`);
        }
        
        const csvText = await response.text();
        currentWords = parseCSV(csvText);
        
        if (currentWords.length === 0) {
            alert('This category has no words yet!');
            return;
        }
        
        // Randomize order
        randomOrder = [...Array(currentWords.length).keys()].sort(() => Math.random() - 0.5);
        currentCardIndex = 0;
        isFlipped = false;
        
        showScreen('flashcardView');
        setupSwipeGestures();
        updateCard();
    } catch (error) {
        console.error('Error loading words:', error);
        alert('Error loading words. Please make sure the CSV file exists in the data folder.');
    }
}

// Update card display
function updateCard(skipAnimation = false) {
    if (currentWords.length === 0) return;
    
    const flashcard = document.getElementById('flashcard');
    const cardFront = flashcard.querySelector('.card-front');
    const cardBack = flashcard.querySelector('.card-back');
    
    // If skipping animation (when navigating), reset flip state immediately
    if (skipAnimation) {
        cardFront.style.transition = 'none';
        cardBack.style.transition = 'none';
        isFlipped = false;
        flashcard.classList.remove('flipped');
        // Force reflow to apply the change immediately
        flashcard.offsetHeight;
        // Re-enable transitions
        cardFront.style.transition = '';
        cardBack.style.transition = '';
    }
    
    const wordIndex = randomOrder[currentCardIndex];
    const word = currentWords[wordIndex];
    
    // Randomly decide whether to show Spanish or English first
    const showSpanishFirst = Math.random() > 0.5;
    
    // Handle different CSV column names (spanish/english or Spanish/English)
    const spanish = word.spanish || word.Spanish || '';
    const english = word.english || word.English || '';
    
    if (showSpanishFirst) {
        document.getElementById('cardFront').textContent = spanish;
        document.getElementById('cardBack').textContent = english;
        document.querySelector('.card-front .card-label').textContent = 'Spanish';
        document.querySelector('.card-back .card-label').textContent = 'English';
    } else {
        document.getElementById('cardFront').textContent = english;
        document.getElementById('cardBack').textContent = spanish;
        document.querySelector('.card-front .card-label').textContent = 'English';
        document.querySelector('.card-back .card-label').textContent = 'Spanish';
    }
    
    // Reset flip state (if not already reset above)
    if (!skipAnimation) {
        isFlipped = false;
        flashcard.classList.remove('flipped');
    }
    
    // Update progress
    const progress = ((currentCardIndex + 1) / currentWords.length) * 100;
    document.getElementById('progress').style.width = progress + '%';
    
    // Update counter
    document.getElementById('cardNumber').textContent = currentCardIndex + 1;
    document.getElementById('totalCards').textContent = currentWords.length;
}

// Flip card
function flipCard() {
    isFlipped = !isFlipped;
    document.getElementById('flashcard').classList.toggle('flipped', isFlipped);
}

// Next card
function nextCard() {
    if (currentCardIndex < currentWords.length - 1) {
        currentCardIndex++;
        updateCard(true); // Skip animation when navigating
    }
}

// Previous card
function previousCard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        updateCard(true); // Skip animation when navigating
    }
}
