/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';
import { render } from 'react-dom';
import { Position } from '@elastic/charts';
import { Visualization } from '../types';
import { getSuggestions } from './xy_suggestions';
import { XYArgs } from './xy_expression';

export const xyVisualization: Visualization<XYArgs, XYArgs> = {
  getSuggestions,

  initialize(state) {
    return (
      state || {
        title: 'Empty line chart',
        legend: { isVisible: true, position: Position.Right },
        seriesType: 'line',
        splitSeriesAccessors: [],
        stackAccessors: [],
        x: {
          accessor: '',
          position: Position.Bottom,
          showGridlines: false,
          title: 'Uknown',
        },
        y: {
          accessors: [],
          position: Position.Left,
          showGridlines: false,
          title: 'Uknown',
        },
      }
    );
  },

  getPersistableState(state) {
    return state;
  },

  renderConfigPanel: (domElement, props) => {
    render(<div>XY Visualization</div>, domElement);
  },

  getMappingOfTableToRoles: (state, datasource) => [],

  toExpression: state => '',
};
