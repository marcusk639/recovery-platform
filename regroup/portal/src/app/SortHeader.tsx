import type { Direction } from './sort';
import { th } from './ui';

export function SortHeader(props: { label: string; active: boolean; direction: Direction; onSort: () => void }) {
  const sort = props.active ? (props.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const arrow = props.active ? (props.direction === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th scope="col" aria-sort={sort} style={th}>
      <button type="button" onClick={props.onSort} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }}>
        {props.label}
        <span aria-hidden="true">{arrow}</span>
      </button>
    </th>
  );
}
