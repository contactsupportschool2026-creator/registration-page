// ==========================================
// ADMIN COMMAND: /settest
// ==========================================
const pendingSetTest = new Map(); // chatId -> { step: 'group' | 'test', group: 'scientific' | 'literature' }

bot.onText(/^\/settest$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingSetTest.set(chatId.toString(), { step: 'group' });

    await bot.sendMessage(chatId, '📚 *Set Active Test*\n\nChoose the group:', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🔬 Scientific', callback_data: 'settest_group_scientific' },
                    { text: '📖 Literature', callback_data: 'settest_group_literature' }
                ],
                [
                    { text: '❌ Cancel', callback_data: 'settest_cancel' }
                ]
            ]
        }
    });
});

// Handle the callback buttons for /settest
// NOTE: This is a SEPARATE callback_query handler just for settest.
// It must be placed BEFORE the big existing callback_query handler,
// or you must merge the logic into the existing one.
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data || '';

    if (!data.startsWith('settest_')) return; // ignore other callbacks

    if (!isAuthorized(query.message.chat.id)) {
        await bot.answerCallbackQuery(query.id, { text: 'Not authorized' });
        return;
    }

    // Cancel
    if (data === 'settest_cancel') {
        pendingSetTest.delete(chatId);
        await bot.editMessageText('❌ Cancelled.', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        await bot.answerCallbackQuery(query.id);
        return;
    }

    // Step 1: Group selected
    if (data === 'settest_group_scientific' || data === 'settest_group_literature') {
        const group = data === 'settest_group_scientific' ? 'scientific' : 'literature';
        pendingSetTest.set(chatId, { step: 'test', group });

        const tests = [
            { id: '1032', title: 'Ethics in the Workplace' },
            { id: '1033', title: 'Corruption in the Health Sector' },
            { id: '1034', title: 'Ethics in Business' },
            { id: '1035', title: 'The Indus Civilization' },
            { id: '1036', title: "Algeria's UNESCO Heritage" },
            { id: '1037', title: 'Ancient Civilizations' },
            { id: '1038', title: 'Ordinary Unethical Behaviour' }
        ];

        const buttons = tests.map(t => ([{
            text: `${t.id} - ${t.title}`,
            callback_data: `settest_choose_${group}_${t.id}`
        }]));

        buttons.push([{ text: '🚫 Cancel Current Test', callback_data: `settest_clear_${group}` }]);
        buttons.push([{ text: '❌ Close', callback_data: 'settest_cancel' }]);

        await bot.editMessageText(
            `📚 *Set Active Test for ${group.toUpperCase()}*\n\nChoose a test:`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        await bot.answerCallbackQuery(query.id);
        return;
    }

    // Step 2: Clear current test
    if (data.startsWith('settest_clear_')) {
        const group = data.replace('settest_clear_', '');

        await withDB(db => {
            if (!db.activeTests) {
                db.activeTests = { scientific: null, literature: null };
            }
            db.activeTests[group] = null;
        });

        await bot.editMessageText(`✅ Active test for *${group}* has been cancelled.`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
        await bot.answerCallbackQuery(query.id, { text: 'Test cancelled' });
        pendingSetTest.delete(chatId);
        return;
    }

    // Step 3: A specific test was chosen
    if (data.startsWith('settest_choose_')) {
        const parts = data.replace('settest_choose_', '').split('_');
        const group = parts[0]; // scientific or literature
        const testId = parts[1]; // 1032, 1033, etc.

        await withDB(db => {
            if (!db.activeTests) {
                db.activeTests = { scientific: null, literature: null };
            }
            db.activeTests[group] = testId;
        });

        await bot.editMessageText(
            `✅ Test *${testId}* is now active for the *${group}* group.`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            }
        );
        await bot.answerCallbackQuery(query.id, { text: 'Test assigned!' });
        pendingSetTest.delete(chatId);
    }
});
