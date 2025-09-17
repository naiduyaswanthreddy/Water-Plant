import * as React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export type SegmentedOption = {
  value: string;
  label: React.ReactNode;
};

interface SegmentedToggleProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const SegmentedToggle: React.FC<SegmentedToggleProps> = ({
  options,
  value,
  onChange,
  className,
  size = 'md',
}) => {
  const count = options.length || 1;
  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));

  const itemText = size === 'sm' ? 'text-xs md:text-sm' : 'text-sm';
  const itemHeightClass = size === 'sm' ? '!h-8' : '!h-9';
  const itemPaddingClass = size === 'sm' ? '!px-3' : '!px-4';

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number; height: number }>({ left: 0, width: 0, height: 0 });

  const updateIndicator = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll('button[data-state]')) as HTMLElement[];
    const idx = Math.max(0, options.findIndex(o => o.value === value));
    const el = items[idx];
    if (!el) return;
    // Apply a tiny inset to create even visual padding against the container border
    const INSET_X = 3; // px
    const INSET_Y = 1; // px
    const width = Math.max(0, el.offsetWidth - INSET_X * 2);
    const left = el.offsetLeft + INSET_X; // relative to padding box
    const height = Math.max(0, el.offsetHeight - INSET_Y * 2);
    setIndicator({ left, width, height });
  }, [options, value]);

  React.useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, selectedIndex]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const obs = new ResizeObserver(() => updateIndicator());
    obs.observe(root);
    window.addEventListener('resize', updateIndicator);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <ToggleGroup
      ref={rootRef as any}
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      size={size === 'sm' ? ('sm' as any) : ('default' as any)}
      variant="default"
      className={cn('relative grid w-fit min-w-0 items-center rounded-full border border-blue-200 bg-white p-1 overflow-hidden gap-0', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 rounded-full bg-[#0E6AA8] shadow-sm transition-transform duration-300 ease-out pointer-events-none',
        )}
        style={{
          width: `${indicator.width}px`,
          left: `${indicator.left}px`,
          height: `${indicator.height}px`,
          transform: 'translateY(-50%)',
          zIndex: 0,
        }}
      />
      {options.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          aria-label={typeof opt.label === 'string' ? opt.label : String(opt.value)}
          className={cn(
            'z-10 flex w-full min-w-0 items-center justify-center rounded-full border border-transparent whitespace-nowrap font-medium leading-none text-[#0E6AA8] transition-colors duration-200 hover:bg-transparent focus-visible:outline-none focus-visible:ring-0 data-[state=on]:bg-transparent data-[state=on]:text-white data-[state=on]:font-semibold data-[state=on]:shadow-none',
            itemText,
            itemHeightClass,
            itemPaddingClass,
          )}
        >
          <span className="truncate">{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
;

export default SegmentedToggle;
