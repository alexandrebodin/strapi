import * as React from 'react';

import { skipToken } from '@reduxjs/toolkit/query';
import {
  Box,
  Checkbox,
  Flex,
  IconButton,
  Loader,
  Searchbar,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Tooltip,
  Typography,
} from '@strapi/design-system';
import { ArrowLeft, ArrowRight, CaretDown, CaretUp } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { styled } from 'styled-components';

import { useDocumentLayout, type ListFieldLayout } from '../../../../../../hooks/useDocumentLayout';
import { useGetAllDocumentsQuery } from '../../../../../../services/documents';
import { CellContent } from '../../../../../ListView/components/TableCells/CellContent';

/**
 * Reusable document list picker.
 *
 * Mirrors the look + primitives of the CM ListView but is self-contained:
 * all state (search, sort, page, pageSize) lives in local React state rather
 * than URL query params, so opening the picker from inside a modal doesn't
 * leak into — or depend on — the underlying page's URL.
 *
 * Selection is controlled: pass `selected` + `onSelectionChange`; the caller
 * decides how to use the resulting ids/docs. Both single and multi-select
 * modes are supported; switching from multi → single trims to a single entry.
 *
 * Follow-ups (not yet implemented):
 *   - Filters UI (advanced filter pills). A `filters` prop passes straight
 *     through to the query when provided externally, so downstream consumers
 *     can bolt filters on.
 *   - Column customisation (pick which fields to render). Right now we use the
 *     content-type's default list layout.
 */

export interface PickedDoc {
  documentId: string;
  locale?: string;
  display: string;
  /** Full row data as returned by the API, useful for display metadata. */
  raw?: Record<string, unknown>;
}

export type SelectionMode = 'single' | 'multiple';

export interface DocumentListPickerProps {
  /** Content-type UID to fetch documents from. */
  model: string;
  /** Selection map keyed by documentId. Controlled. */
  selected: Record<string, PickedDoc>;
  onSelectionChange: (next: Record<string, PickedDoc>) => void;
  mode: SelectionMode;
  /** Filter documents by publication status. Defaults to 'draft'. */
  status?: 'draft' | 'published';
  /** Pre-applied filters (matches the strapi query filter shape). Optional. */
  filters?: Record<string, unknown>;
  /** Initial page size. Defaults to 10. */
  initialPageSize?: number;
  /** Optional height cap for the table container (CSS value). */
  maxTableHeight?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

const FALLBACK_DISPLAY_FIELDS = ['name', 'title', 'label', 'displayName', 'slug', 'documentId'];

const pickDisplay = (doc: Record<string, unknown>, mainField: string | undefined): string => {
  const candidate = mainField ? doc[mainField] : undefined;
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  if (typeof candidate === 'number') return String(candidate);
  for (const key of FALLBACK_DISPLAY_FIELDS) {
    const value = doc[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number') return String(value);
  }
  return String(doc.documentId ?? doc.id ?? '—');
};

const useDebouncedValue = <T,>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const PAGE_SIZES = [10, 25, 50, 100];

/* -------------------------------------------------------------------------------------------------
 * Styled bits
 * -----------------------------------------------------------------------------------------------*/

const TableScroller = styled(Box)<{ $maxHeight?: string }>`
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: auto;
  max-height: ${({ $maxHeight }) => $maxHeight ?? '420px'};
  background: ${({ theme }) => theme.colors.neutral0};
`;

const SortableTh = styled(Th)<{ $sortable?: boolean; $active?: boolean }>`
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;
  white-space: nowrap;
  color: ${({ theme, $active }) => ($active ? theme.colors.primary600 : theme.colors.neutral600)};
`;

const Row = styled(Tr)<{ $selected?: boolean }>`
  cursor: pointer;
  background: ${({ theme, $selected }) => ($selected ? theme.colors.primary100 : 'transparent')};
  &:hover {
    background: ${({ theme, $selected }) =>
      $selected ? theme.colors.primary100 : theme.colors.neutral100};
  }
`;

/* -------------------------------------------------------------------------------------------------
 * DocumentListPicker
 * -----------------------------------------------------------------------------------------------*/

const DocumentListPicker: React.FC<DocumentListPickerProps> = ({
  model,
  selected,
  onSelectionChange,
  mode,
  status = 'draft',
  filters,
  initialPageSize = 10,
  maxTableHeight,
}) => {
  const { formatMessage } = useIntl();
  const [searchInput, setSearchInput] = React.useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = React.useState<`${string}:${'ASC' | 'DESC'}` | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  // Reset back to page 1 when the key query parameters change.
  React.useEffect(() => {
    setPage(1);
  }, [model, search, sort, status, pageSize]);

  const {
    list: { layout, settings },
  } = useDocumentLayout(model);

  // Apply the content-type's default sort on first load if the user hasn't
  // picked one explicitly.
  React.useEffect(() => {
    if (sort) return;
    if (settings?.defaultSortBy && settings?.defaultSortOrder) {
      const direction = settings.defaultSortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      setSort(`${settings.defaultSortBy}:${direction}`);
    }
  }, [sort, settings?.defaultSortBy, settings?.defaultSortOrder]);

  const queryArgs = model
    ? {
        model,
        params: {
          pageSize: String(pageSize),
          page: String(page),
          status,
          ...(search ? { _q: search } : {}),
          ...(sort ? { sort } : {}),
          ...(filters ? { filters } : {}),
        } as Record<string, unknown>,
      }
    : skipToken;

  const { data, isFetching } = useGetAllDocumentsQuery(queryArgs as any);

  const results: any[] = (data as any)?.results ?? [];
  const pagination = (data as any)?.pagination;
  const pageCount: number = pagination?.pageCount ?? 1;
  const total: number = pagination?.total ?? 0;

  const toggleRow = (doc: any) => {
    const display = pickDisplay(doc, settings?.mainField);
    const entry: PickedDoc = {
      documentId: doc.documentId,
      locale: doc.locale,
      display,
      raw: doc,
    };

    if (mode === 'single') {
      onSelectionChange({ [entry.documentId]: entry });
      return;
    }

    const next = { ...selected };
    if (next[entry.documentId]) {
      delete next[entry.documentId];
    } else {
      next[entry.documentId] = entry;
    }
    onSelectionChange(next);
  };

  const toggleSort = (header: ListFieldLayout) => {
    if (!header.sortable) return;
    const [currentKey, currentDir] = (sort ?? '').split(':');
    if (currentKey === header.name) {
      setSort(`${header.name}:${currentDir === 'ASC' ? 'DESC' : 'ASC'}`);
    } else {
      setSort(`${header.name}:ASC`);
    }
  };

  const [sortKey, sortDir] = (sort ?? '').split(':');
  const colCount = layout.length + 1; // +1 checkbox column
  const rowCount = Math.max(results.length + 1, 1);

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Searchbar
        name="picker-search"
        value={searchInput}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.currentTarget.value)}
        onClear={() => setSearchInput('')}
        clearLabel={formatMessage({
          id: 'components.Blocks.picker.clear',
          defaultMessage: 'Clear',
        })}
        placeholder={formatMessage({
          id: 'components.Blocks.picker.search',
          defaultMessage: 'Search documents…',
        })}
      >
        {formatMessage({
          id: 'components.Blocks.picker.searchLabel',
          defaultMessage: 'Search',
        })}
      </Searchbar>

      <TableScroller $maxHeight={maxTableHeight}>
        <Table colCount={colCount} rowCount={rowCount}>
          <Thead>
            <Tr>
              <Th>
                <span aria-hidden />
              </Th>
              {layout.map((header) => {
                const isActive = sortKey === header.name;
                return (
                  <SortableTh
                    key={header.name}
                    $sortable={header.sortable}
                    $active={isActive}
                    onClick={() => toggleSort(header)}
                  >
                    <Tooltip
                      label={
                        header.sortable
                          ? formatMessage(
                              {
                                id: 'components.TableHeader.sort',
                                defaultMessage: 'Sort on {label}',
                              },
                              { label: header.label }
                            )
                          : header.label
                      }
                    >
                      <Flex gap={1} alignItems="center">
                        <Typography variant="sigma">{header.label}</Typography>
                        {isActive ? sortDir === 'ASC' ? <CaretUp /> : <CaretDown /> : null}
                      </Flex>
                    </Tooltip>
                  </SortableTh>
                );
              })}
            </Tr>
          </Thead>
          <Tbody>
            {isFetching ? (
              <Tr>
                <Td colSpan={colCount}>
                  <Flex justifyContent="center" padding={4}>
                    <Loader small>
                      {formatMessage({
                        id: 'components.Blocks.picker.loading',
                        defaultMessage: 'Loading…',
                      })}
                    </Loader>
                  </Flex>
                </Td>
              </Tr>
            ) : results.length === 0 ? (
              <Tr>
                <Td colSpan={colCount}>
                  <Box padding={4}>
                    <Typography textColor="neutral500">
                      {formatMessage({
                        id: 'components.Blocks.picker.empty',
                        defaultMessage: 'No documents match this search.',
                      })}
                    </Typography>
                  </Box>
                </Td>
              </Tr>
            ) : (
              results.map((row) => {
                const isSelected = Boolean(selected[row.documentId]);
                return (
                  <Row
                    key={row.documentId ?? row.id}
                    $selected={isSelected}
                    onClick={() => toggleRow(row)}
                  >
                    <Td>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(row)}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      />
                    </Td>
                    {layout.map((header) => (
                      <Td key={header.name}>
                        <CellContent
                          content={row[header.name.split('.')[0]]}
                          rowId={row.documentId ?? row.id}
                          {...header}
                        />
                      </Td>
                    ))}
                  </Row>
                );
              })
            )}
          </Tbody>
        </Table>
      </TableScroller>

      <Flex justifyContent="space-between" alignItems="center" gap={3}>
        <Flex alignItems="center" gap={2}>
          <Typography variant="pi" textColor="neutral600">
            {formatMessage(
              {
                id: 'components.Blocks.picker.pageInfo',
                defaultMessage: 'Page {page} of {pageCount} · {total} total',
              },
              { page, pageCount, total }
            )}
          </Typography>
        </Flex>
        <Flex alignItems="center" gap={2}>
          <Typography variant="pi" textColor="neutral600">
            {formatMessage({
              id: 'components.Blocks.picker.pageSize',
              defaultMessage: 'Per page',
            })}
          </Typography>
          <SingleSelect
            size="S"
            value={String(pageSize)}
            onChange={(next) => setPageSize(Number(next))}
          >
            {PAGE_SIZES.map((size) => (
              <SingleSelectOption key={size} value={String(size)}>
                {size}
              </SingleSelectOption>
            ))}
          </SingleSelect>
          <IconButton
            label={formatMessage({
              id: 'components.Blocks.picker.prev',
              defaultMessage: 'Previous page',
            })}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ArrowLeft />
          </IconButton>
          <IconButton
            label={formatMessage({
              id: 'components.Blocks.picker.next',
              defaultMessage: 'Next page',
            })}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            <ArrowRight />
          </IconButton>
        </Flex>
      </Flex>
    </Flex>
  );
};

export { DocumentListPicker };
