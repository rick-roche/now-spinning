import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { Icon } from "./Icon";

interface SideCompletionModalProps {
  boundary: "flip" | "change-disc";
  currentUnit: string;
  nextUnit: string;
  currentTrackTitle: string;
  nextTrackTitle: string;
  onContinue: () => Promise<void>;
  onPause: () => void;
  isOpen: boolean;
  loading?: boolean;
  error?: string | null;
}

export function SideCompletionModal(props: SideCompletionModalProps) {
  const {
    boundary,
    currentUnit,
    nextUnit,
    currentTrackTitle,
    nextTrackTitle,
    isOpen,
    onContinue,
    onPause, loading = false, error,
  } = props;

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Content>
        <Dialog.Title>
          <Flex gap="2" align="center">
            <Icon name="album" />
            {boundary === "flip" ? "Time to flip" : "Time to change disc"}
          </Flex>
        </Dialog.Title>
        <Dialog.Description>
          {boundary === "flip"
            ? `You just finished side ${currentUnit}. Flip to side ${nextUnit} to keep listening.`
            : `You just finished disc ${currentUnit}. Change to disc ${nextUnit} to keep listening.`}
        </Dialog.Description>

        <Text as="p" size="2" color="gray" mt="3" mb="5">
          Last track: <strong>{currentTrackTitle}</strong>
          <br />
          Next track: <strong>{nextTrackTitle}</strong>
        </Text>

        <Flex gap="3" justify="end" mt="6">
          {error && <Text as="p" color="red" size="2">{error}</Text>}
          <Button variant="soft" onClick={onPause} disabled={loading}>
            Keep paused
          </Button>
          <Button onClick={() => void onContinue()} disabled={loading}>
            Continue to {boundary === "flip" ? `side ${nextUnit}` : `disc ${nextUnit}`}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
