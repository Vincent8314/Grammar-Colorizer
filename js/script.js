/* Copyright © 2025/03/23. Libouton Vincent S.F. All rights reserved.
Unauthorized copying, modification, distribution, or use of this code
is strictly prohibited without express written permission.*/
document.addEventListener('DOMContentLoaded', function() {
    // Check if RiTa is available
    if (typeof RiTa === 'undefined') {
        alert('Error: Required language processing library not loaded. Please check your connection and reload the page.');
        return;
    }
    
    // DOM elements
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const toggleBtn = document.getElementById('toggle-btn');
    const clearBtn = document.getElementById('clear-btn');
    const underlineBtn = document.getElementById('underline-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const statusIndicator = document.getElementById('status');
    const legendItems = document.querySelectorAll('.legend-item');
    
    // Speech recognition elements
    const micBtn = document.getElementById('mic-btn');
    const languageSelect = document.getElementById('language-select');
    const speechStatus = document.getElementById('speech-status');
    
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let isListening = false;
    
    if (!SpeechRecognition) {
        micBtn.disabled = true;
        speechStatus.textContent = "Speech recognition not supported in this browser.";
        speechStatus.style.color = "red";
        alert("Speech recognition is not supported in your browser. Try using Chrome, Edge, or Safari.");
    } else {
        // Initialize speech recognition
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = languageSelect.value;
    }
    
    // Application state
    let isPreviewMode = false;
    let isUnderlineMode = false;
    let disabledPOS = new Set();
    
    // Text history for undo/redo
    let textHistory = [editor.value];
    let historyPosition = 0;
    const maxHistorySize = 50;
    
    // POS tag mapping - ENHANCED with more verb forms
    const posMapping = {
        // Adverbs
        'rb': 'adverb',
        'rbr': 'adverb',
        'rbs': 'adverb',
        'wrb': 'adverb',
        
        // Nouns
        'nn': 'noun',
        'nns': 'noun',
        'nnp': 'noun',
        'nnps': 'noun',
        
        // Prepositions
        'in': 'preposition',
        'to': 'preposition',
        
        // Determiners
        'dt': 'determiner',
        'pdt': 'determiner',
        'wdt': 'determiner',
        
        // Interjections
        'uh': 'interjection',
        
        // Particles
        'rp': 'particle',
        
        // Pronouns
        'prp': 'pronoun',
        'prp$': 'pronoun',
        'wp': 'pronoun',
        'wp$': 'pronoun',
        
        'ex': 'particle',
        
        // Verbs - expanded to catch more forms
        'vb': 'verb',   // base form
        'vbd': 'verb',  // past tense
        'vbg': 'verb',  // gerund/present participle
        'vbn': 'verb',  // past participle
        'vbp': 'verb',  // non-3rd person singular present
        'vbz': 'verb',  // 3rd person singular present
        'md': 'verb',   // modal
        'aux': 'verb',  // auxiliary verb (additional mapping)
        
        // Numbers
        'cd': 'number',
        
        // Conjunctions
        'cc': 'conjunction',
        
        // Adjectives
        'jj': 'adjective',
        'jjr': 'adjective',
        'jjs': 'adjective'
    };
    
    // Helper functions
    function escapeHTML(text) {
        return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    
    function updateStatus(message) {
        statusIndicator.textContent = `Status: ${message}`;
    }
    
    function updateUndoRedoButtons() {
        undoBtn.disabled = historyPosition <= 0;
        redoBtn.disabled = historyPosition >= textHistory.length - 1;
    }
    
    function addToHistory(text) {
        // Don't add if same as current
        if (textHistory[historyPosition] === text) return;
        
        // Truncate forward history if we're in the middle
        if (historyPosition < textHistory.length - 1) {
        textHistory = textHistory.slice(0, historyPosition + 1);
        }
        
        // Add new state
        textHistory.push(text);
        
        // Limit size
        if (textHistory.length > maxHistorySize) {
        textHistory.shift();
        }
        
        // Update position
        historyPosition = textHistory.length - 1;
        
        // Update buttons
        updateUndoRedoButtons();
    }
    
    // Core functionality - FIXED to handle "is" and other forms of "to be" correctly
    function highlightText() {
        try {
        const text = editor.value;
        let highlighted = '';
        
        // Process text line by line
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip empty lines
            if (!line.trim()) {
            highlighted += '\n';
            continue;
            }
            
            // Keep heading and label lines white
            if (line.startsWith('#') || line.startsWith('-')) {
            highlighted += `<span style="color: white;">${escapeHTML(line)}</span>\n`;
            continue;
            }
            
            // Process normal line
            highlighted += processLine(line) + '\n';
        }
        
        preview.innerHTML = highlighted;
        } catch (error) {
        console.error('Error highlighting text:', error);
        preview.innerHTML = `<span style="color: red;">Error processing text: ${error.message}</span>`;
        }
    }
    
    function processLine(text) {
        if (!text.trim()) return '';
        
        let result = '';
        try {
        // Tokenize and get parts of speech
        const tokens = RiTa.tokenize(text);
        const posTags = RiTa.pos(tokens);
        
        // Process each token
        for (let j = 0; j < tokens.length; j++) {
            const token = tokens[j];
            let tag = posTags[j].toLowerCase();
            
            // Handle punctuation
            if (/^[.,!?;:()'"\-]$/.test(token)) {
            tag = 'punct';
            }
            
            // FIXED: Special handling for common verbs that might be misclassified
            // This ensures "is", "am", "are", etc. are always classified as verbs
            const isToBeVerb = /^(is|am|are|was|were|be|been|being)$/i.test(token);
            if (isToBeVerb) {
            tag = 'vbz'; // Force it to be treated as a verb
            }
            
            // Check for words in our custom dictionary and override the tag
            const lowerToken = token.toLowerCase();
            if (customWordDictionary[lowerToken]) {
            // Use the posCodeMapping to convert friendly names to actual POS codes
            tag = posCodeMapping[customWordDictionary[lowerToken]] || tag;
            }
            
            // Map to our categories
            let pos = posMapping[tag] || 'unknown';
            
            // Add special class for "to be" verbs for extra styling if needed
            let extraClass = '';
            if (pos === 'verb' && isToBeVerb) {
            extraClass = ' is-form';
            }
            
            // Apply styling
            const isDisabled = disabledPOS.has(pos);
            const classNames = isDisabled ? `${pos}${extraClass} disabled` : `${pos}${extraClass}`;
            
            result += `<span class="${classNames}">${escapeHTML(token)}</span>`;
            
            // Add space if needed
            if (j < tokens.length - 1 && !/^[.,!?;:()'"\-]$/.test(tokens[j+1])) {
            result += ' ';
            }
        }
        } catch (e) {
        console.error("Error processing line:", e);
        result = escapeHTML(text); // Fallback
        }
        
        return result;
    }
    
    // UI functions
    function toggleMode() {
        isPreviewMode = !isPreviewMode;
        
        if (isPreviewMode) {
        // Switch to preview
        editor.style.display = 'none';
        highlightText();
        preview.style.display = 'block';
        toggleBtn.textContent = 'Switch to Edit';
        updateStatus('Preview Mode');
        } else {
        // Switch to edit
        preview.style.display = 'none';
        editor.style.display = 'block';
        toggleBtn.textContent = 'Switch to Preview';
        updateStatus('Edit Mode');
        editor.focus();
        }
    }
    
    function clearText() {
        addToHistory(editor.value);
        editor.value = '';
        preview.innerHTML = '';
        addToHistory('');
        
        if (isPreviewMode) {
        toggleMode();
        }
    }
    
    function undo() {
        if (historyPosition > 0) {
        historyPosition--;
        editor.value = textHistory[historyPosition];
        
        if (isPreviewMode) {
            highlightText();
        }
        
        updateUndoRedoButtons();
        }
    }
    
    function redo() {
        if (historyPosition < textHistory.length - 1) {
        historyPosition++;
        editor.value = textHistory[historyPosition];
        
        if (isPreviewMode) {
            highlightText();
        }
        
        updateUndoRedoButtons();
        }
    }
    
    function toggleUnderlines() {
        isUnderlineMode = !isUnderlineMode;
        
        if (isUnderlineMode) {
        preview.classList.add('underline-mode');
        underlineBtn.textContent = 'Remove Underlines';
        } else {
        preview.classList.remove('underline-mode');
        underlineBtn.textContent = 'Add Underlines';
        }
    }
    
    // Speech Recognition Functions
    function insertTextAtCursor(text) {
        // Make sure we're in edit mode
        if (isPreviewMode) {
        toggleMode();
        }
        
        // Focus editor
        editor.focus();
        
        // Get cursor position
        const cursorPos = editor.selectionStart || editor.value.length;
        const textBefore = editor.value.substring(0, cursorPos);
        const textAfter = editor.value.substring(cursorPos);
        
        // Check if we need punctuation
        let insertText = text;
        
        // Update editor value
        editor.value = textBefore + insertText + textAfter;
        
        // Move cursor to end of inserted text
        editor.selectionStart = cursorPos + insertText.length;
        editor.selectionEnd = cursorPos + insertText.length;
        
        // Scroll to view the inserted text if needed
        editor.scrollTop = editor.scrollHeight;
        
        // Add to history
        addToHistory(editor.value);
    }
    
    function startListening() {
        if (!recognition) return;
        
        try {
        recognition.lang = languageSelect.value;
        recognition.start();
        isListening = true;
        
        // Update UI
        micBtn.innerHTML = '<span class="mic-icon"></span>Stop Listening';
        micBtn.classList.add('listening');
        speechStatus.textContent = "Listening...";
        updateStatus('Listening to speech');
        
        // Make sure we're in edit mode and editor is focused
        if (isPreviewMode) {
            toggleMode();
        }
        editor.focus();
        } catch (error) {
        console.error('Error starting speech recognition:', error);
        speechStatus.textContent = "Error starting speech recognition. Try again.";
        }
    }
    
    function stopListening() {
        if (!recognition) return;
        
        try {
        recognition.stop();
        isListening = false;
        
        // Update UI
        micBtn.innerHTML = '<span class="mic-icon"></span>Start Listening';
        micBtn.classList.remove('listening');
        speechStatus.textContent = "Stopped listening";
        updateStatus('Edit Mode');
        } catch (error) {
        console.error('Error stopping speech recognition:', error);
        }
    }
    
    function toggleListening() {
        if (isListening) {
        stopListening();
        } else {
        startListening();
        }
    }
    
    // Speech Recognition Event Handlers
    if (recognition) {
        recognition.onresult = function(event) {
        let finalTranscript = '';
        let interimTranscript = '';
        
        // Get all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
            } else {
            interimTranscript += transcript;
            }
        }
        
        // If we have final transcripts, insert them
        if (finalTranscript) {
            insertTextAtCursor(finalTranscript);
        }
        
        // Update status with interim results
        if (interimTranscript) {
            speechStatus.textContent = `Listening... "${interimTranscript}"`;
        }
        };
        
        recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        speechStatus.textContent = `Error: ${event.error}`;
        
        // Reset UI if not recoverable
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            stopListening();
        }
        };
        
        recognition.onend = function() {
        // If we're supposed to be listening but recognition stopped, restart it
        if (isListening) {
            try {
            recognition.start();
            speechStatus.textContent = "Reconnected...";
            } catch (error) {
            console.error('Error restarting speech recognition:', error);
            isListening = false;
            micBtn.innerHTML = '<span class="mic-icon"></span>Start Listening';
            micBtn.classList.remove('listening');
            speechStatus.textContent = "Stopped listening due to timeout. Click to restart.";
            }
        }
        };
    }
    
    // Language change handler
    languageSelect.addEventListener('change', function() {
        if (recognition) {
        const wasListening = isListening;
        
        // Stop if currently listening
        if (wasListening) {
            stopListening();
        }
        
        // Update language
        recognition.lang = this.value;
        speechStatus.textContent = `Language changed to ${this.options[this.selectedIndex].text}`;
        
        // Restart if was listening
        if (wasListening) {
            setTimeout(startListening, 200);
        }
        }
    });
    
    // Event listeners
    toggleBtn.addEventListener('click', toggleMode);
    clearBtn.addEventListener('click', clearText);
    underlineBtn.addEventListener('click', toggleUnderlines);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    micBtn.addEventListener('click', toggleListening);
    
    editor.addEventListener('input', function() {
        // Track changes for undo/redo
        setTimeout(function() {
        addToHistory(editor.value);
        }, 300);
    });
    
    // Keyboard shortcuts
    editor.addEventListener('keydown', function(e) {
        if (e.ctrlKey) {
        if (e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (e.key === 'y') {
            e.preventDefault();
            redo();
        }
        }
    });
    
    // Legend toggling
    legendItems.forEach(item => {
        item.addEventListener('click', function() {
        const pos = this.getAttribute('data-pos');
        const colorBox = this.querySelector('.color-box');
        
        if (colorBox.classList.contains('disabled')) {
            colorBox.classList.remove('disabled');
            disabledPOS.delete(pos);
        } else {
            colorBox.classList.add('disabled');
            disabledPOS.add(pos);
        }
        
        if (isPreviewMode) {
            highlightText();
        }
        });
    });
    
    // ======================================================
    // CUSTOM WORD CLASSIFICATION SYSTEM
    // ======================================================

    // Custom word dictionary - Add your words here with their desired part of speech
    // Each entry should be 'word': 'part-of-speech-code'
    const customWordDictionary = {
        // NOUNS (people, places, things, ideas)
        'happiness': 'noun',
        'success': 'noun',
        'achievement': 'noun',
        'anxiety': 'noun',
        'depression': 'noun',
        'freedom': 'noun',
        'analysis': 'noun',
        'knowledge': 'noun',
        'justice': 'noun',
        'democracy': 'noun',
        'algorithm': 'noun',
        'software': 'noun',
        'hardware': 'noun',
        'website': 'noun',
        'internet': 'noun',
        'technology': 'noun',
        'database': 'noun',
        'framework': 'noun',
        
        // VERBS (actions, states of being)
        'analyze': 'verb',
        'visualize': 'verb',
        'recognize': 'verb',
        'emphasize': 'verb',
        'categorize': 'verb',
        'utilize': 'verb',
        'optimize': 'verb',
        'finalize': 'verb',
        'organize': 'verb',
        'customize': 'verb',
        'implement': 'verb',
        'integrate': 'verb',
        'program': 'verb',
        'debug': 'verb',
        'compile': 'verb',
        'process': 'verb',
        'compute': 'verb',
        'interface': 'verb',
        
        // ADJECTIVES (describe nouns)
        'beautiful': 'adjective',
        'wonderful': 'adjective',
        'amazing': 'adjective',
        'fantastic': 'adjective',
        'incredible': 'adjective',
        'brilliant': 'adjective',
        'essential': 'adjective',
        'innovative': 'adjective',
        'effective': 'adjective',
        'efficient': 'adjective',
        'technical': 'adjective',
        'computational': 'adjective',
        'digital': 'adjective',
        'virtual': 'adjective',
        'interactive': 'adjective',
        'responsive': 'adjective',
        'functional': 'adjective',
        'intuitive': 'adjective',
        
        // ADVERBS (modify verbs, adjectives, or other adverbs)
        'quickly': 'adverb',
        'silently': 'adverb',
        'carefully': 'adverb',
        'effectively': 'adverb',
        'efficiently': 'adverb',
        'extremely': 'adverb',
        'absolutely': 'adverb',
        'definitely': 'adverb',
        'precisely': 'adverb',
        'relatively': 'adverb',
        'technically': 'adverb',
        'virtually': 'adverb',
        'digitally': 'adverb',
        'functionally': 'adverb',
        'intuitively': 'adverb',
        'programmatically': 'adverb',
        'computationally': 'adverb',
        'automatically': 'adverb',

       //DETERMINERS
        'my': 'determiner',

        // PREPOSITIONS
        'through': 'preposition',
        'during': 'preposition',
        'without': 'preposition',
        'within': 'preposition',
        'between': 'preposition',
        'among': 'preposition',
        'throughout': 'preposition',
        'beside': 'preposition',
        'beyond': 'preposition',
        'beneath': 'preposition',
        
        // CONJUNCTIONS
        'although': 'conjunction',
        'because': 'conjunction',
        'since': 'conjunction',
        'unless': 'conjunction',
        'whereas': 'conjunction',
        'while': 'conjunction',
        'however': 'conjunction',
        'therefore': 'conjunction',
        'moreover': 'conjunction',
        'nevertheless': 'conjunction',
        
        // INTERJECTIONS

        'aha': 'interjection',
        'ah': 'interjection',
        'ahem': 'interjection',
        'alas': 'interjection',
        'argh': 'interjection',
        'aw': 'interjection',
        'awesome': 'interjection',
        'bam': 'interjection',
        'bingo': 'interjection',
        'boo': 'interjection',
        'bravo': 'interjection',
        'bummer': 'interjection',
        'cheers': 'interjection',
        'congrats': 'interjection',
        'congratulations': 'interjection',
        'crikey': 'interjection',
        'damn': 'interjection',
        'dang': 'interjection',
        'darn': 'interjection',
        'duh': 'interjection',
        'eek': 'interjection',
        'eh': 'interjection',
        'encore': 'interjection',
        'eureka': 'interjection',
        'eww': 'interjection',
        'fantastic': 'interjection',
        'geez': 'interjection',
        'gosh': 'interjection',
        'gotcha': 'interjection',
        'great': 'interjection',
        'ha': 'interjection',
        'haha': 'interjection',
        'hallelujah': 'interjection',
        'hello': 'interjection',
        'hey': 'interjection',
        'hi': 'interjection',
        'hmm': 'interjection',
        'hum' : 'interjection',
        'hooray': 'interjection',
        'huh': 'interjection',
        'hurray': 'interjection',
        'hurrah': 'interjection',
        'indeed': 'interjection',
        'jeez': 'interjection',
        'meh': 'interjection',
        'mmmm': 'interjection',
        'nah': 'interjection',
        'no': 'interjection',
        'nope': 'interjection',
        'oh': 'interjection',
        'oho': 'interjection',
        'ok': 'interjection',
        'okay': 'interjection',
        'oops': 'interjection',
        'ouch': 'interjection',
        'ow': 'interjection',
        'phew': 'interjection',
        'psst': 'interjection',
        'shh': 'interjection',
        'sheesh': 'interjection',
        'shucks': 'interjection',
        'sigh': 'interjection',
        'sorry': 'interjection',
        'super': 'interjection',
        'sweet': 'interjection',
        'tada': 'interjection',
        'thanks': 'interjection',
        'touché': 'interjection',
        'ugh': 'interjection',
        'Ugh': 'interjection',
        'uh-huh': 'interjection',
        'uh-oh': 'interjection',
        'umm': 'interjection',
        'voilà': 'interjection',
        'wahoo': 'interjection',
        'well': 'interjection',
        'whee': 'interjection',
        'whew': 'interjection',
        'whoa': 'interjection',
        'woohoo': 'interjection',
        'wow': 'interjection',
        'yeah': 'interjection',
        'yay': 'interjection',
        'yikes': 'interjection',
        'yippee': 'interjection',
        'yo': 'interjection',
        'yuck': 'interjection',
        'yum': 'interjection',
        'zing': 'interjection',
        'zoom': 'interjection',

        
        // Common tech terms
        'javascript': 'noun',
        'python': 'noun',
        'java': 'noun',
        'html': 'noun',
        'css': 'noun',
        'api': 'noun',
        'app': 'noun',
        'code': 'noun',
        'server': 'noun',
        'client': 'noun',
        'browser': 'noun',
        'debugging': 'noun',
        'programming': 'noun',
        'developer': 'noun',
        'function': 'noun',
        'method': 'noun',
        'class': 'noun',
        'object': 'noun',
        'variable': 'noun',
        'syntax': 'noun',
        'language': 'noun',
        
        // Add any problematic words that need special handling here
    };

    // Part of speech code mapping
    const posCodeMapping = {
        'noun': 'nn',
        'verb': 'vb',
        'adjective': 'jj',
        'adverb': 'rb',
        'pronoun': 'prp',
        'determiner': 'dt',
        'preposition': 'in',
        'conjunction': 'cc',
        'interjection': 'uh',
        'number': 'cd',
        'punctuation': 'punct'
    };

    function tokenizeAndIdentifyInterjections(text) {
  // Punctuation characters to handle
  const punctuation = /[.,!?;:()[\]{}'"—–-]/g;
  
  // 1. Split text into words 
  const words = text.split(/\s+/);
  const result = [];
  
  // 2. Process each word
  for (let word of words) {
    // Skip empty words
    if (!word) continue;
    
    // Store original word
    const original = word;
    
    // Remove punctuation for checking
    const cleanWord = word.replace(punctuation, '').toLowerCase();
    
    // Check if it's an interjection
    if (interjectionsDictionary.hasOwnProperty(cleanWord)) {
      // It's an interjection
      result.push({
        original: original,
        word: cleanWord,
        type: 'interjection',
        // Extract just the punctuation that was attached
        punctuation: original.match(punctuation) || []
      });
    } else {
      // Not an interjection, keep as is
      result.push({
        original: original,
        word: cleanWord,
        type: 'other'
      });
    }
  }
  
  return result;
}

    // Add this function to allow adding custom words dynamically
    function addCustomWord(word, partOfSpeech) {
        if (!word || !partOfSpeech) return false;
        
        // Check if part of speech is valid
        if (!posCodeMapping[partOfSpeech.toLowerCase()]) {
        console.error(`Invalid part of speech: ${partOfSpeech}. Valid options are: ${Object.keys(posCodeMapping).join(', ')}`);
        return false;
        }
        
        // Add to dictionary
        customWordDictionary[word.toLowerCase()] = partOfSpeech.toLowerCase();
        
        // Refresh display if in preview mode
        if (isPreviewMode) {
        highlightText();
        }
        
        return true;
    }
    
    // Initialize
    addToHistory(editor.value);
    updateUndoRedoButtons();
    
    // Check for speech recognition support on page load
    if (SpeechRecognition) {
        speechStatus.textContent = "Ready to listen. Click the microphone button to start.";
    }

    console.log('Custom word classification system loaded successfully!');
    });