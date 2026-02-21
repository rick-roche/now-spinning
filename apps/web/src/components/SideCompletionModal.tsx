import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { Icon } from "./Icon";

interface SideCompletionModalProps {
  currentSide: string;
  nextSide: string;
  currentTrackTitle: string;
  nextTrackTitle: string;
  onContinue: () => Promise<void>;
  onPause: () => void;
  isOpen: boolean;
}

export function SideCompletionModal(props: SideCompletionModalProps) {
  const {
    currentSide,
    nextSide,
    currentTrackTitle,
    nextTrackTitle,
    isOpen,
    onContinue,
    onPause,
  } = props;

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Content>
        <Dialog.Title>
          <Flex gap="2" align="center">
            <Icon name="album" />
            Time to flip the record
          </Flex>
        </Dialog.Title>
        <Dialog.Description>
          You just finished side {currentSide}. Flip to side {nextSide} to keep listening.
        </Dialog.Description>

        <Text as="p" size="2" color="gray" mt="3" mb="5">
          Last track: <strong>{currentTrackTitle}</strong>
          <br />
          Next track: <strong>{nextTrackTitle}</strong>
        </Text>

        <Flex gap="3" justify="end" mt="6">
          <Button variant="soft" onClick={onPause}>
            Keep paused
          </Button>
          <Button onClick={() => void onContinue()}>
            Continue to side {nextSide}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
