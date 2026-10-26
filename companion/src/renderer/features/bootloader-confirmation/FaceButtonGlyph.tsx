import type { BootloaderConfirmationFaceButton } from '@shared/types';

const FACE_BUTTON_LABELS: Record<BootloaderConfirmationFaceButton, string> = {
  triangle: 'Triangle',
  circle: 'Circle',
  cross: 'Cross',
  square: 'Square'
};

/** The symbol inside a PlayStation face button, drawn in a 512-unit box like the glyph assets. */
function FaceButtonSymbol({ button }: { readonly button: BootloaderConfirmationFaceButton }) {
  switch (button) {
    case 'triangle':
      return <polygon points="256 158 158 322 354 322" />;
    case 'circle':
      return <circle cx="256" cy="256" r="94" />;
    case 'cross':
      return (
        <>
          <line x1="172" y1="172" x2="340" y2="340" />
          <line x1="340" y1="172" x2="172" y2="340" />
        </>
      );
    case 'square':
      return <rect x="172" y="172" width="168" height="168" />;
  }
}

/**
 * A PlayStation face button: a dark key with the symbol in its traditional
 * color (teal-green triangle, red circle, blue cross, pink square).
 */
export function FaceButtonGlyph({ button }: { readonly button: BootloaderConfirmationFaceButton }) {
  return (
    <svg
      className={`face-button-glyph face-button-${button}`}
      viewBox="0 0 512 512"
      role="img"
      aria-label={FACE_BUTTON_LABELS[button]}
    >
      <circle className="face-button-key" cx="256" cy="256" r="232" />
      <g className="face-button-symbol">
        <FaceButtonSymbol button={button} />
      </g>
    </svg>
  );
}
