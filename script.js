document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitBtn');
    const dobInput = document.getElementById('dob');

    dobInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) value = value.substring(0, 4) + '-' + value.substring(4);
        if (value.length >= 5) value = value.substring(0, 7) + '-' + value.substring(7);
        if (value.length > 10) value = value.substring(0, 10);
        e.target.value = value;
    });

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async function logToTelegram(message) {
        try {
            await fetch('/api/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
        } catch (e) {
            console.error('Failed to send log:', e);
        }
    }

    submitBtn.addEventListener('click', async () => {
        const formData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value,
            dob: document.getElementById('dob').value,
            wilaya: document.getElementById('wilaya').value,
            shaba: document.getElementById('shaba').value,
            isNizami: document.getElementById('nizami').checked,
            schoolName: document.getElementById('schoolName').value
        };

        if (!formData.firstName || !formData.lastName || !formData.email || !formData.dob || !formData.wilaya || !formData.shaba || !formData.schoolName) {
            alert("Please fill out all fields correctly."); return;
        }

        if (!isValidEmail(formData.email)) {
            alert("Please enter a valid email address."); return;
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(formData.dob)) {
            alert("Please enter Date of Birth in YYYY-MM-DD format."); return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            const response = await fetch('/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok && data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            } else {
                const errMsg = data.error 
                    ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
                    : ('Server returned status ' + response.status);
                console.error("Payment Error:", errMsg);
                await logToTelegram('❌ PAYMENT CHECKOUT FAILED\nName: ' + formData.firstName + ' ' + formData.lastName + '\nEmail: ' + formData.email + '\nError: ' + errMsg);
                alert("Error: " + errMsg);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Proceed to Payment';
            }
        } catch (error) {
            console.error("Payment Error:", error);
            const errMsg = error.message || 'Network error - please check your connection';
            await logToTelegram('❌ PAYMENT CHECKOUT FAILED\nName: ' + formData.firstName + ' ' + formData.lastName + '\nEmail: ' + formData.email + '\nError: ' + errMsg);
            alert("Error: " + errMsg);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Proceed to Payment';
        }
    });
});
