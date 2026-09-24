module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`The Syndicate is online as ${client.user.tag}`);
        client.user.setActivity('HD music & chat', { type: 2 });
    },
};
