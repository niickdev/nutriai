/*
  ====================================================================
  CONFIGURATION & SECRETS MANAGEMENT
  ====================================================================
  IMPORTANT: Do not hardcode your API Key or PIN in this file.
  This project is designed for deployment using a CI/CD pipeline (like GitHub Actions)
  that securely injects your secrets by replacing the placeholder values below.

  How to set up with GitHub Actions:
  1. In your GitHub repository, go to Settings > Secrets and Variables > Actions.
  2. Create a repository secret named `NUTRI_AI_API_KEY` for your API key.
  3. Create another repository secret named `NUTRI_AI_PIN` for your 4-digit PIN.
  4. In your deployment workflow file (e.g., .github/workflows/deploy.yml), use a
     script command (like `sed` or `replace-in-file`) to replace `__API_KEY__` and `__PIN__`
     in this file with your secrets during the build step.

     Example `sed` command in a workflow step:
     - name: Replace placeholders
       run: |
         sed -i "s|__API_KEY__|${{ secrets.NUTRI_AI_API_KEY }}|g" script.js
         sed -i "s|__PIN__|${{ secrets.NUTRI_AI_PIN }}|g" script.js
*/
const API_KEY = "__NUTRI_AI_API_KEY__";
const CORRECT_PIN = "__NUTRI_AI_PIN__";

const API_URL = 'https://models.inference.ai.azure.com/chat/completions';
const AI_PROMPT = `Analyze the meal in the image. Respond ONLY with a valid JSON object. Do not include markdown or text outside the JSON. The structure must be: {"items": [{"item": "string", "calories": number}], "nutrition_summary": {"total_calories": number, "macronutrients": {"protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number}, "micronutrients": {"sugar_g": number, "sodium_mg": number}}, "general_summary": "string", "confidence_score": "string (High, Medium, or Low)", "health_tips": "string"}`;


document.addEventListener('DOMContentLoaded', () => {
    const lockScreen = document.getElementById('lock-screen');
    const pinDisplay = document.getElementById('pin-display');
    const pinDots = pinDisplay.querySelectorAll('.dot');
    const keypad = document.getElementById('keypad');
    const appContainer = document.getElementById('app-container');
    const views = document.querySelectorAll('.view');
    const useCameraBtn = document.getElementById('use-camera-btn');
    const uploadPhotoInput = document.getElementById('upload-photo-input');
    const cameraStream = document.getElementById('camera-stream');
    const canvas = document.getElementById('canvas');
    const takePhotoBtn = document.getElementById('take-photo-btn');
    const imagePreview = document.getElementById('image-preview');
    const resultsContent = document.getElementById('results-content');
    const backBtns = document.querySelectorAll('.back-btn');

    let enteredPin = '';
    let currentStream = null;

    const showView = (viewId) => {
        views.forEach(view => view.classList.remove('active'));
        document.getElementById(viewId)?.classList.add('active');
    };

    const resetToInitialView = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        cameraStream.srcObject = null;
        imagePreview.src = '';
        uploadPhotoInput.value = '';
        resultsContent.innerHTML = '';
        document.getElementById('results-view').classList.remove('visible');
        showView('initial-view');
    };

    const handleKeypadClick = (e) => {
        const key = e.target.dataset.key;
        if (!key) return;

        if (key === 'backspace') {
            enteredPin = enteredPin.slice(0, -1);
        } else if (enteredPin.length < 4) {
            enteredPin += key;
        }
        
        updatePinDisplay();

        if (enteredPin.length === 4) {
            checkPin();
        }
    };

    const updatePinDisplay = () => {
        pinDots.forEach((dot, index) => {
            dot.classList.toggle('filled', index < enteredPin.length);
        });
    };

    const checkPin = () => {
        if (enteredPin === CORRECT_PIN) {
            lockScreen.classList.add('hidden');
            appContainer.classList.add('visible');
        } else {
            pinDisplay.classList.add('shake');
            setTimeout(() => {
                pinDisplay.classList.remove('shake');
                enteredPin = '';
                updatePinDisplay();
            }, 500);
        }
    };

    const startCamera = async () => {
        try {
            const constraints = { video: { facingMode: 'environment' } };
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream.srcObject = currentStream;
            showView('camera-view');
        } catch (err) {
            console.error("Error accessing camera: ", err);
            alert("Could not access the camera. Please ensure permissions are granted.");
        }
    };
    
    const takePhoto = () => {
        const context = canvas.getContext('2d');
        canvas.width = cameraStream.videoWidth;
        canvas.height = cameraStream.videoHeight;
        
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(cameraStream, 0, 0, canvas.width, canvas.height);
        
        const imageDataUrl = canvas.toDataURL('image/jpeg');
        resetToInitialView();
        showView('loading-view');
        analyzeImage(imageDataUrl);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            showView('loading-view');
            analyzeImage(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const analyzeImage = async (base64Image) => {
        if (API_KEY === "__API_KEY__") {
            alert('API key is not configured. Please set it up in your deployment process.');
            resetToInitialView();
            return;
        }

        const payload = {
            model: "gpt-4-vision-preview",
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: AI_PROMPT },
                        { type: "image_url", image_url: { "url": base64Image } }
                    ]
                }
            ]
        };
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;
            const jsonData = extractJson(content);
            
            if (jsonData) {
                displayResults(jsonData);
            } else {
                throw new Error("Failed to parse JSON from AI response.");
            }

        } catch (error) {
            console.error('Analysis failed:', error);
            alert(`Analysis failed: ${error.message}`);
            resetToInitialView();
        }
    };
    
    const extractJson = (text) => {
        const match = text.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
        if (!match) return null;
        
        const jsonString = match[1] || match[2];
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("JSON parsing error:", e);
            return null;
        }
    };
    
    const displayResults = (data) => {
        const { items, nutrition_summary, confidence_score, health_tips } = data;
        const { total_calories, macronutrients, micronutrients } = nutrition_summary;
        const confidenceClass = (confidence_score || 'medium').toLowerCase();

        const html = `
            <div class="result-item" id="total-calories-display">
                <span>${Math.round(total_calories) || 'N/A'}</span> <small>kcal</small>
            </div>
            <div class="result-item" id="confidence-pill" class="${confidenceClass}">
                ${confidence_score || 'Medium'} Confidence
            </div>
            <div class="result-item macros-grid">
                <div class="macro-card">
                    <h3>Protein</h3>
                    <p>${macronutrients.protein_g || 0}<small>g</small></p>
                </div>
                <div class="macro-card">
                    <h3>Carbs</h3>
                    <p>${macronutrients.carbs_g || 0}<small>g</small></p>
                </div>
                <div class="macro-card">
                    <h3>Fat</h3>
                    <p>${macronutrients.fat_g || 0}<small>g</small></p>
                </div>
                <div class="macro-card">
                    <h3>Fiber</h3>
                    <p>${macronutrients.fiber_g || 0}<small>g</small></p>
                </div>
            </div>
            <div class="result-item details-card">
                <h3>Identified Items</h3>
                <ul>
                   ${items && items.length > 0 ? items.map(item => `<li>${item.item} (~${Math.round(item.calories)} kcal)</li>`).join('') : '<li>No specific items identified.</li>'}
                </ul>
                 <h3>Details & Tip</h3>
                 <ul>
                    <li>Sugar: ${micronutrients.sugar_g ?? 'N/A'}g</li>
                    <li>Sodium: ${micronutrients.sodium_mg ?? 'N/A'}mg</li>
                 </ul>
                <p>${health_tips || 'Enjoy your meal mindfully!'}</p>
            </div>
        `;
        
        resultsContent.innerHTML = html;
        showView('results-view');
        
        setTimeout(() => {
            document.getElementById('results-view').classList.add('visible');
        }, 50);
    };

    keypad.addEventListener('click', handleKeypadClick);
    backBtns.forEach(btn => btn.addEventListener('click', resetToInitialView));
    useCameraBtn.addEventListener('click', startCamera);
    takePhotoBtn.addEventListener('click', takePhoto);
    uploadPhotoInput.addEventListener('change', handleFileUpload);
});