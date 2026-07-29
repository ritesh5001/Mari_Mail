/**
 * GooeyFilter — an invisible SVG filter that makes overlapping blurred shapes
 * "merge" into gooey blobs. Reference it via `filter: url(#<id>)` on a
 * container whose children you want to gooify (e.g. an animated tab pill).
 *
 * Adapted from the shadcn gooey-filter (unchanged logic — it's a pure SVG def).
 */
const GooeyFilter = ({
  id = "goo-filter",
  strength = 10,
}: {
  id?: string;
  strength?: number;
}) => {
  return (
    <svg className="absolute hidden" aria-hidden>
      <defs>
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={strength} result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
};

export { GooeyFilter };
