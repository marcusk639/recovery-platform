import React, { useState } from 'react';

export class SearchState {
  searchTerm: string = '';
}

function useSearch(initialState: SearchState) {
  const [search, setSearchState] = useState(initialState);

  return [search, setSearchState];
}

export default useSearch;
