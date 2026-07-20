import { EmptyState } from '@greyvetro/ui';

export function NoClips() {
  return (
    <EmptyState icon="🎙️" title="No clips yet">
      Generate your first voiceover to see it here.
    </EmptyState>
  );
}

export function NoProjects() {
  return (
    <EmptyState icon="🎬" title="Start a project">
      Group clips into a project to build your video.
    </EmptyState>
  );
}
