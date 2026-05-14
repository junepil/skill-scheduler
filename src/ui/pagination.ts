export type PageResult<T> = {
  slice: T[];
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function paginate<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const start = page * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    slice,
    totalPages,
    hasPrev: page > 0,
    hasNext: page < totalPages - 1,
  };
}
