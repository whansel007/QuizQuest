// The professor-only "Test AI" check.
//
// The endpoint POST /api/hero-lab/test-ai needs a professor session and uses
// the shared Gemini client, capped at three attempts. The credentials live only
// in the backend .env; the browser never holds an API key.
//
// The arena has no "Test AI" button at the moment, so this module does nothing
// on load: it only wires itself up if a #test-ai-btn element is on the page.
// Add the button to world.html and it works:
//
//   <button id="test-ai-btn" type="button">Test AI</button>

export async function testAi() {
  console.log('[AI] Requesting a multiple choice question from the server Gemini client...');
  try {
    const token = sessionStorage.getItem('qq-token');
    const res = await fetch('/api/hero-lab/test-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({
        prompt: 'Make a multiple choice question about what AI is.',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[AI] Request failed:', data.error || data);
      return;
    }
    console.log('[AI] Model answer:\n' + data.answer);
  } catch (err) {
    console.error('[AI] Error calling AI endpoint:', err);
  }
}

const testAiBtn = document.querySelector('#test-ai-btn');
if (testAiBtn) {
  testAiBtn.addEventListener('click', testAi);
}
