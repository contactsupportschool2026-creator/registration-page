// ==========================================
// API: Get Assigned Test for a student
// ==========================================
app.get('/api/get-assigned-test', async (req, res) => {
    try {
        const requestedUsername = (req.query.username || '').toLowerCase().replace('@', '').trim();
        if (!requestedUsername) {
            return res.json({ valid: false, message: 'Username is required' });
        }

        const db = await readDB();
        
        // Support both formats
        const students = db.students || (Array.isArray(db) ? db : []);
        const activeTests = db.activeTests || { scientific: null, literature: null };

        const student = students.find(s => 
            s.username && s.username.toLowerCase().replace('@', '') === requestedUsername
        );

        if (!student) {
            return res.json({ valid: false, message: 'Username not found' });
        }

        // Determine group from shaba
        const scientificShabas = [
            'sciences expérimentales',
            'mathématiques',
            'technique mathématiques',
            'technique sciences expérimentales',
            'informatique'
        ];

        const shaba = (student.shaba || '').toLowerCase();
        const group = scientificShabas.includes(shaba) ? 'scientific' : 'literature';

        const testId = activeTests[group] || null;

        if (!testId) {
            return res.json({ 
                valid: true, 
                active: false, 
                group,
                message: 'There is no active test at the moment' 
            });
        }

        res.json({ 
            valid: true, 
            active: true, 
            testId, 
            group 
        });

    } catch (error) {
        console.error('Get Assigned Test Error:', error.message);
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});
