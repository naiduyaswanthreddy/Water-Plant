import React from 'react';

export const HeaderSkeleton: React.FC<{ titleWidth?: string; subtitleWidth?: string }> = ({ titleWidth = 'w-40', subtitleWidth = 'w-64' }) => (
  <div className="space-y-2">
    <div className={`h-7 rounded bg-muted ${titleWidth}`} />
    <div className={`h-4 rounded bg-muted ${subtitleWidth}`} />
  </div>
);

export const CardsSkeleton: React.FC<{ count?: number; cols?: string }> = ({ count = 4, cols = 'grid md:grid-cols-2 lg:grid-cols-4 gap-4' }) => (
  <div className={cols}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-2/5 mb-3" />
        <div className="h-8 bg-muted rounded w-1/3" />
      </div>
    ))}
  </div>
);

export const ListSkeleton: React.FC<{ rows?: number; withAvatar?: boolean }>
  = ({ rows = 6, withAvatar = false }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
        {withAvatar && <div className="h-8 w-8 rounded bg-muted" />}
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-3 bg-muted rounded w-1/4" />
        </div>
        <div className="h-4 bg-muted rounded w-16" />
      </div>
    ))}
  </div>
);

export const FormRowSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="grid md:grid-cols-4 gap-4">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="space-y-2">
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-9 bg-muted rounded" />
      </div>
    ))}
  </div>
);

export const PageSkeleton: React.FC<{ showFilters?: boolean; cardCount?: number; listRows?: number }>
  = ({ showFilters = false, cardCount = 4, listRows = 8 }) => (
  <div className="space-y-6">
    <HeaderSkeleton />
    {showFilters && (
      <div className="rounded-xl border bg-card p-4">
        <FormRowSkeleton rows={4} />
      </div>
    )}
    <CardsSkeleton count={cardCount} />
    <div className="rounded-xl border bg-card p-4">
      <ListSkeleton rows={listRows} />
    </div>
  </div>
);
