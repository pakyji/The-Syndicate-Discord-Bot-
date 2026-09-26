const { Events } = require('discord.js');

const MEMBER_ID = '1382654025329021078';
const ROLE_NAME = 'Helper';
const TARGET_CHANNEL_ID = '1536500109154451618';

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return;

            const member = await guild.members.fetch(MEMBER_ID).catch(() => null);
            if (!member) {
                console.log("Helper member not found in the server.");
                return;
            }

            let helperRole = guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_NAME.toLowerCase());
            if (!helperRole) {
                helperRole = await guild.roles.create({
                    name: ROLE_NAME,
                    color: '#0055ff',
                    reason: 'Automatic Helper role creation for dedicated member'
                });
            }

            if (!member.roles.cache.has(helperRole.id)) {
                await member.roles.add(helperRole);
                console.log(`Successfully assigned Helper role to ${member.user.tag}`);

                const channel = await guild.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
                if (channel) {
                    await channel.send({
                        content: `🎉 Congratulations <@${MEMBER_ID}>! You have been awarded the **${ROLE_NAME}** role. Thank you for your dedication to the server!`
                    });
                }

                try {
                    await member.send({
                        content: `🎉 Congratulations! You have been granted the **${ROLE_NAME}** role in our server. Thanks for your hard work!`
                    });
                } catch (dmError) {
                    console.log("Could not send DM to the member (DMs might be closed).");
                }
            }
        } catch (error) {
            console.error('Helper setup error:', error);
        }
    },
};
