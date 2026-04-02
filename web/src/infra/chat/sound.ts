import sound from 'infra/notification/notification.mp3';
import Message from './internal/Message';

export interface IShouldPlayIncomingChatSoundArgs {
  chatSoundEnabled?: boolean;
  currentUserNickname?: string;
  lastMessage?: Message;
  newMessage?: Message;
}

let chatMessageSound: HTMLAudioElement | undefined;

export function shouldPlayIncomingChatSound({
  chatSoundEnabled,
  currentUserNickname,
  lastMessage,
  newMessage,
}: IShouldPlayIncomingChatSoundArgs): boolean {
  if (!chatSoundEnabled || !newMessage) {
    return false;
  }

  const isDuplicateMessage =
    newMessage.message === lastMessage?.message &&
    newMessage.userId === lastMessage?.userId &&
    newMessage.isoTimestamp === lastMessage?.isoTimestamp;
  if (isDuplicateMessage) {
    return false;
  }

  if (newMessage.userId === 0) {
    return false;
  }

  if (currentUserNickname && newMessage.userNickname === currentUserNickname) {
    return false;
  }

  return true;
}

export function playChatMessageSound() {
  if (!chatMessageSound) {
    chatMessageSound = new Audio(sound);
  }

  chatMessageSound.play();
}
