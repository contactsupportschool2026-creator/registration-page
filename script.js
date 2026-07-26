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
                throw new Error(data.error || 'Failed to create payment link');
            }
        } catch (error) {
            console.error("Payment Error:", error);
            alert("Error: " + (error.message || "Unknown"));
            submitBtn.disabled = false;
            submitBtn.textContent = 'Proceed to Payment';
        }
    });
});