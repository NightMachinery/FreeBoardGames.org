import { playChatMessageSound, shouldPlayIncomingChatSound } from './sound';

describe('chat sound helpers', () => {
  const originalAudio = global.Audio;

  afterEach(() => {
    global.Audio = originalAudio;
    jest.restoreAllMocks();
  });

  it('should only play for incoming non-system messages from other users when enabled', () => {
    expect(
      shouldPlayIncomingChatSound({
        chatSoundEnabled: true,
        currentUserNickname: 'alice',
        lastMessage: { userId: 2, userNickname: 'bob', message: 'old', isoTimestamp: '2024-01-01T00:00:00Z' },
        newMessage: { userId: 3, userNickname: 'carol', message: 'hello', isoTimestamp: '2024-01-01T00:00:01Z' },
      }),
    ).toEqual(true);

    expect(
      shouldPlayIncomingChatSound({
        chatSoundEnabled: false,
        currentUserNickname: 'alice',
        newMessage: { userId: 3, userNickname: 'carol', message: 'hello', isoTimestamp: '2024-01-01T00:00:01Z' },
      }),
    ).toEqual(false);

    expect(
      shouldPlayIncomingChatSound({
        chatSoundEnabled: true,
        currentUserNickname: 'alice',
        newMessage: { userId: 0, userNickname: 'notice', message: 'hello', isoTimestamp: '2024-01-01T00:00:01Z' },
      }),
    ).toEqual(false);

    expect(
      shouldPlayIncomingChatSound({
        chatSoundEnabled: true,
        currentUserNickname: 'alice',
        newMessage: { userId: 3, userNickname: 'alice', message: 'hello', isoTimestamp: '2024-01-01T00:00:01Z' },
      }),
    ).toEqual(false);

    expect(
      shouldPlayIncomingChatSound({
        chatSoundEnabled: true,
        currentUserNickname: 'alice',
        lastMessage: { userId: 3, userNickname: 'carol', message: 'hello', isoTimestamp: '2024-01-01T00:00:01Z' },
        newMessage: { userId: 3, userNickname: 'carol', message: 'hello', isoTimestamp: '2024-01-01T00:00:01Z' },
      }),
    ).toEqual(false);
  });

  it('should play the chat sound asset', () => {
    const play = jest.fn();
    global.Audio = jest.fn().mockImplementation(() => ({ play })) as any;

    playChatMessageSound();

    expect(global.Audio).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
  });
});
