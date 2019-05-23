/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { getSuggestions } from './xy_suggestions';
import { TableColumn } from '../types';

describe('xy_suggestions', () => {
  function numCol(columnId: string): TableColumn {
    return {
      columnId,
      operation: {
        dataType: 'number',
        id: `avg_${columnId}`,
        label: `Avg ${columnId}`,
        isBucketed: false,
      },
    };
  }

  function strCol(columnId: string): TableColumn {
    return {
      columnId,
      operation: {
        dataType: 'string',
        id: `terms_${columnId}`,
        label: `Top 5 ${columnId}`,
        isBucketed: true,
      },
    };
  }

  function dateCol(columnId: string): TableColumn {
    return {
      columnId,
      operation: {
        dataType: 'date',
        id: `date_histogram_${columnId}`,
        isBucketed: true,
        label: `${columnId} histogram`,
      },
    };
  }

  test('ignores invalid combinations', () => {
    expect(
      getSuggestions({
        tableColumns: {
          1: [dateCol('a')],
          2: [strCol('foo'), strCol('bar')],
        },
      })
    ).toEqual([]);
  });

  test('suggests a basic x y chart with date on x', () => {
    expect(
      getSuggestions({
        tableColumns: {
          0: [numCol('a')],
          1: [numCol('bytes'), dateCol('date')],
        },
      })
    ).toMatchSnapshot();
  });

  test('suggests a split x y chart with date on x', () => {
    expect(
      getSuggestions({
        tableColumns: {
          1: [numCol('price'), numCol('quantity'), dateCol('date'), strCol('product')],
        },
      })
    ).toMatchSnapshot();
  });

  test('supports multiple suggestions', () => {
    expect(
      getSuggestions({
        tableColumns: {
          1: [numCol('price'), dateCol('date')],
          2: [numCol('count'), strCol('country')],
        },
      })
    ).toMatchSnapshot();
  });

  test('handles two numeric values', () => {
    expect(
      getSuggestions({
        tableColumns: {
          1: [numCol('quantity'), numCol('price')],
        },
      })
    ).toMatchSnapshot();
  });

  test('places non-numeric columns on x', () => {
    expect(
      getSuggestions({
        tableColumns: {
          1: [
            numCol('num votes'),
            {
              columnId: 'mybool',
              operation: {
                dataType: 'boolean',
                id: 'mybool',
                isBucketed: false,
                label: 'Yes / No',
              },
            },
          ],
        },
      })
    ).toMatchSnapshot();
  });
});
