document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitBtn');
    const dobInput = document.getElementById('dob');
    const loadingOverlay = document.getElementById('loadingOverlay');

    // 1. Format DOB input automatically
    dobInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) value = value.substring(0, 4) + '-' + value.substring(4);
        if (value.length >= 5) value = value.substring(0, 7) + '-' + value.substring(7);
        if (value.length > 10) value = value.substring(0, 10);
        e.target.value = value;
    });

    // 2. Helper to log frontend errors to your Telegram bot
    async function logToTelegram(message) {
        try {
            await fetch('https://registration-page-9888765.onrender.com/api/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
        } catch (e) {
            console.error('Failed to send log:', e);
        }
    }

    // 3. Handle Form Submission
    submitBtn.addEventListener('click', async () => {
        // Check if form is valid (button turns green in index.html)
        if (!submitBtn.classList.contains('active')) {
            submitBtn.classList.add('shake');
            setTimeout(() => submitBtn.classList.remove('shake'), 500);
            return;
        }

        // Gather new form data
        const formData = {
            fullName: document.getElementById('fullName').value.trim(),
            telegramUsername: document.getElementById('telegramUsername').value.trim(),
            dob: document.getElementById('dob').value.trim(),
            wilaya: document.getElementById('wilaya').value,
            shaba: document.getElementById('shaba').value,
            isNizami: document.getElementById('nizami').checked,
            schoolName: document.getElementById('schoolName').value.trim() || 'N/A (حر)'
        };

        // Final fallback validation
        if (!formData.fullName || !formData.telegramUsername || !formData.dob || !formData.wilaya || !formData.shaba) {
            alert("Please fill out all required fields correctly."); return;
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(formData.dob)) {
            alert("Please enter Date of Birth in YYYY-MM-DD format."); return;
        }

        // Show full-screen loading animation
        loadingOverlay.classList.add('active');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            const response = await fetch('https://registration-page-9888765.onrender.com/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok && data.checkoutUrl) {
                // Redirect to Chargily payment page
                window.location.href = data.checkoutUrl;
            } else {
                const errMsg = data.error 
                    ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
                    : ('Server returned status ' + response.status);
                console.error("Payment Error:", errMsg);
                await logToTelegram('❌ PAYMENT CHECKOUT FAILED\nName: ' + formData.fullName + '\nTelegram: ' + formData.telegramUsername + '\nError: ' + errMsg);
                alert("Error: " + errMsg);
                
                // Hide loading and reset button if failed
                loadingOverlay.classList.remove('active');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Proceed to Payment';
            }
        } catch (error) {
            console.error("Payment Error:", error);
            const errMsg = error.message || 'Network error - please check your connection';
            await logToTelegram('❌ PAYMENT CHECKOUT FAILED\nName: ' + formData.fullName + '\nTelegram: ' + formData.telegramUsername + '\nError: ' + errMsg);
            alert("Error: " + errMsg);
            
            // Hide loading and reset button if failed
            loadingOverlay.classList.remove('active');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Proceed to Payment';
        }
    });
});
