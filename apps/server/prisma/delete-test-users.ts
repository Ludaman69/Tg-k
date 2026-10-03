import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_USERS = ['evgeniy', 'anastasia', 'artem', 'polina', 'daniil', 'vladimir'];

async function main() {
  console.log('Удаление 6 тестовых пользователей...\n');

  // Get user IDs first
  const users = await prisma.user.findMany({
    where: { username: { in: TEST_USERS } },
    select: { id: true, username: true, displayName: true },
  });

  if (users.length === 0) {
    console.log('❌ Пользователи не найдены.');
    return;
  }

  console.log(`Найдено пользователей: ${users.length}`);
  for (const u of users) {
    console.log(`  ${u.username} (${u.displayName}) — ${u.id}`);
  }

  const userIds = users.map((u) => u.id);

  // Удаляем зависимости в правильном порядке
  const steps = [
    { name: 'HiddenMessage', action: () => prisma.hiddenMessage.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'ReadReceipt', action: () => prisma.readReceipt.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'Reaction', action: () => prisma.reaction.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'StoryView', action: () => prisma.storyView.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'Story (by user)', action: () => prisma.story.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'Message (as sender)', action: () => prisma.message.deleteMany({ where: { senderId: { in: userIds } } }) },
    { name: 'Message (forwarded from)', action: () => prisma.message.deleteMany({ where: { forwardedFromId: { in: userIds } } }) },
    { name: 'ChatMember', action: () => prisma.chatMember.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'Friendship (sent)', action: () => prisma.friendship.deleteMany({ where: { userId: { in: userIds } } }) },
    { name: 'Friendship (received)', action: () => prisma.friendship.deleteMany({ where: { friendId: { in: userIds } } }) },
    { name: 'PushSubscription', action: () => prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } }) },
  ];

  for (const step of steps) {
    try {
      const result = await step.action();
      console.log(`  ✅ ${step.name}: удалено ${result.count}`);
    } catch (e) {
      console.log(`  ⚠️  ${step.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Наконец удаляем самих пользователей
  const deleteResult = await prisma.user.deleteMany({
    where: { username: { in: TEST_USERS } },
  });

  console.log(`\n✅ Удалено пользователей: ${deleteResult.count}`);
  console.log('Удаление тестовых пользователей завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());