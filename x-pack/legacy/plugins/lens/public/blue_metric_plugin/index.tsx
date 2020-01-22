/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { npSetup } from 'ui/new_platform';
import { FormatFactory, getFormat } from 'ui/visualize/loader/pipeline_helpers/utilities';
import React from 'react';
import ReactDOM, { render } from 'react-dom';
import { Ast } from '@kbn/interpreter/target/common';
import { i18n } from '@kbn/i18n';
import { I18nProvider } from '@kbn/i18n/react';
import { EuiFormRow } from '@elastic/eui';
import {
  ExpressionFunction,
  IInterpreterRenderFunction,
  IInterpreterRenderHandlers,
} from '../../../../../../src/plugins/expressions/public';
import {
  LensMultiTable,
  FramePublicAPI,
  Visualization,
  SuggestionRequest,
  VisualizationSuggestion,
  VisualizationLayerConfigProps,
} from '../types';
import { VisualizationContainer } from '../visualization_container';
import chartMetricSVG from '../assets/chart_metric.svg';
import { generateId } from '../id_generator';
import { NativeRenderer } from '../native_renderer';
import { AutoScale } from '../metric_visualization_plugin/auto_scale';

// The in-memory state
interface State {
  layerId: string;
  accessor: string;
}

// The state which is stored in the saved object
type PersistableState = State;

// The expression function configuration
interface MetricExpressionConfig extends State {
  title: string;
  mode: 'reduced' | 'full';
}

// The expression render configuration
interface MetricRenderConfig {
  data: LensMultiTable;
  args: MetricExpressionConfig;
}

// The metric expression function's return value.
interface MetricExpressionResult {
  type: 'render';
  as: 'lens_blue_metric_chart_renderer';
  value: MetricRenderConfig;
}

// This is the expression function which takes the saved configuration + the
// data returned from Elastic, and tells the expression to render the metric
// chart renderer. This is basically boilerplate that is required due to the
// fact that Lens / embeddables were built on top of Kibana's expressions we
// could probably (should probably?) figure out a way to not require all Lens
// visualizations to have to wire this up.
const blueMetricChartExpression: ExpressionFunction<
  'lens_blue_metric_chart',
  LensMultiTable,
  MetricExpressionConfig,
  MetricExpressionResult
> = ({
  name: 'lens_blue_metric_chart',
  type: 'render',
  help: 'A metric chart',
  args: {
    title: {
      types: ['string'],
      help: 'The chart title.',
    },
    accessor: {
      types: ['string'],
      help: 'The column whose value is being displayed',
    },
    mode: {
      types: ['string'],
      options: ['reduced', 'full'],
      default: 'full',
      help:
        'The display mode of the chart - reduced will only show the metric itself without min size',
    },
  },
  context: {
    types: ['lens_multitable'],
  },
  fn(data: LensMultiTable, args: MetricRenderConfig) {
    return {
      type: 'render',
      as: 'lens_blue_metric_chart_renderer',
      value: {
        data,
        args,
      },
    };
  },
} as unknown) as ExpressionFunction<
  'lens_blue_metric_chart',
  LensMultiTable,
  MetricExpressionConfig,
  MetricExpressionResult
>;

// This is the expression renderer which was is invoked as a result of
// the lens_blue_metric_chart function (above) being called in an expression.
// It's job is to render the metric visualization. (More boilerplate.)
const getMetricChartRenderer = (
  formatFactory: FormatFactory
): IInterpreterRenderFunction<MetricRenderConfig> => ({
  name: 'lens_blue_metric_chart_renderer',
  displayName: 'Metric chart',
  help: 'Metric chart renderer',
  validate: () => {},
  reuseDomNode: true,
  render: (domNode: Element, config: MetricRenderConfig, handlers: IInterpreterRenderHandlers) => {
    ReactDOM.render(<MetricChart {...config} formatFactory={formatFactory} />, domNode, () => {
      handlers.done();
    });
    handlers.onDestroy(() => ReactDOM.unmountComponentAtNode(domNode));
  },
});

/**
 * This takes the configured state, the FramePublicAPI, and the mode and returns
 * an expression which will render the metric visualization. (Kind of more boiler
 * plate. With a bit of thought, this could probably be done away with.)
 *
 * @param state - the metric visualization's internal state
 * @param frame - the Lens editor frame API, which currently is essentially a layer-management
 *   API used to add / remove / access layer information.
 * @param mode - full or reduced, if full, render normally, if reduced, render as a thumbnail
 */
const toExpression = (
  state: State,
  frame: FramePublicAPI,
  mode: 'reduced' | 'full' = 'full'
): Ast => {
  const [datasource] = Object.values(frame.datasourceLayers);
  const operation = datasource && datasource.getOperationForColumnId(state.accessor);

  return {
    type: 'expression',
    chain: [
      {
        type: 'function',
        function: 'lens_blue_metric_chart',
        arguments: {
          title: [(operation && operation.label) || ''],
          accessor: [state.accessor],
          mode: [mode],
        },
      },
    ],
  };
};

/**
 * The *actual* render logic for rendering our visualization.
 *
 * data = the data returned from Elastic search, which we are rendering
 * args = the metric chart configuration passed in from the expression
 * formatFactory = the formatter we'll use to format any data we display
 */
function MetricChart({
  data,
  args,
  formatFactory,
}: MetricRenderConfig & { formatFactory: FormatFactory }) {
  const { title, accessor, mode } = args;
  let value = '-';
  const firstTable = Object.values(data.tables)[0];

  if (firstTable) {
    const column = firstTable.columns[0];
    const row = firstTable.rows[0];
    if (row[accessor]) {
      value =
        column && column.formatHint
          ? formatFactory(column.formatHint).convert(row[accessor])
          : Number(Number(row[accessor]).toFixed(3)).toString();
    }
  }

  return (
    <VisualizationContainer reportTitle={title} className="lnsMetricExpression__container">
      <AutoScale style={{ color: 'blue' }}>
        <div data-test-subj="lns_metric_value" style={{ fontSize: '60pt', fontWeight: 600 }}>
          {value}
        </div>
        {mode === 'full' && (
          <div data-test-subj="lns_metric_title" style={{ fontSize: '24pt' }}>
            {title}
          </div>
        )}
      </AutoScale>
    </VisualizationContainer>
  );
}

/**
 * Given a set of parameters, return suggestions, if possible.
 *
 * table = metadata describing the shape of the table which the datasource is suggesting
 * state = the currently configured state of the metric visualization (may be null, if metric
 *   is not the current visualization type being edited in Lens)
 * keptLayerIds = the list of layers which are being used in the suggestion. The metric visualization
 *   only supports one layer.
 */
function getSuggestions({
  table,
  state,
  keptLayerIds,
}: SuggestionRequest<State>): Array<VisualizationSuggestion<State>> {
  // We only render metric charts for single-row queries. We require a single, numeric column.
  if (
    table.isMultiRow ||
    keptLayerIds.length > 1 ||
    (keptLayerIds.length && table.layerId !== keptLayerIds[0]) ||
    table.columns.length !== 1 ||
    table.columns[0].operation.dataType !== 'number'
  ) {
    return [];
  }

  // Don't suggest current table if visualization is active
  if (state && table.changeType === 'unchanged') {
    return [];
  }

  const col = table.columns[0];
  const title = table.label || col.operation.label;

  return [
    {
      // Human-friendly descriptive text
      title,
      // A number from 0-1 which Lens uses to prioritize
      // suggestions from least (0) to most (1) relevant.
      score: 0.5,
      // The icon used in the visualization switcher UI.
      previewIcon: chartMetricSVG,
      // If this suggestion is chosen / used by Lens, this
      // will become the metric visualization's internal state.
      state: {
        layerId: table.layerId,
        accessor: col.columnId,
      },
    },
  ];
}

/**
 * The UI for configuring the metric visualization. Each visualization creates
 * its own custom UI for configu. It receives its state, the editor frame API
 * as explained previously, and the ID of the layer being configured.
 *
 * Lens doesn't require plugins use React, so its APIs are all React agnostic.
 * The <NativeRenderer .../> block below is a helper for that purpose.
 *
 * The fact that the dragDropContext needs to be passed through the visualization
 * here is due to a bit of a leaky abstraction.
 */
function MetricConfigPanel(props: VisualizationLayerConfigProps<State>) {
  const { state, frame, layerId } = props;
  const datasource = frame.datasourceLayers[layerId];

  return (
    <EuiFormRow
      className="lnsConfigPanel__axis"
      label={i18n.translate('xpack.lens.blueMetric.valueLabel', {
        defaultMessage: 'Value',
      })}
    >
      <NativeRenderer
        data-test-subj={'lns_metric_valueDimensionPanel'}
        render={datasource.renderDimensionPanel}
        nativeProps={{
          layerId,
          columnId: state.accessor,
          dragDropContext: props.dragDropContext,
          filterOperations: op => !op.isBucketed && op.dataType === 'number',
        }}
      />
    </EuiFormRow>
  );
}

/**
 * This is the meat of the visualization. It's the actual plugin signature.
 * This is where all of the previous functions and definitions come together
 * in a shape that Lens understands.
 */
const metricVisualization: Visualization<State, PersistableState> = {
  // Uniquely identifies this plugin (must be unique across all Lens plugins)
  id: 'lnsBlueMetric',

  // The list of sub-visualizations that this plugin exposes. In most
  // cases, this will only have one entry, but the XY visualization
  // supports numerous sub types. This is what the chart switcher UI uses.
  visualizationTypes: [
    {
      id: 'lnsBlueMetric',
      icon: 'visMetric',
      largeIcon: chartMetricSVG,
      label: i18n.translate('xpack.lens.blueMetric.label', {
        defaultMessage: 'Blue Metric',
      }),
    },
  ],

  // Clears the specified layer (the second parameter is the layerId, but
  // we ignore it, since we only have one layer).
  clearLayer(state) {
    return {
      ...state,
      // The visualization is in charge of specifying column ids which
      // the datasource will then configure and provide. It's a bit of
      // a leaky abstraction, in my opinion. In my PoC, I came up with
      // an alternative, which is that visualizations provide a data
      // template which Lens core logic would use to coordinate data
      // between the datasource and the visualization.
      //
      // generateId is a bit of a hacky thing. Essentially, this is
      // the way that visualizations indicate that they need a column
      // the column may or may not exist in the datasource (yet). When
      // the datasource sees that a visualization is asking for an unknown
      // column, it will display the "configure new column" UI.
      accessor: generateId(),
    };
  },

  // Given our state, return the list of layers we support
  getLayerIds(state) {
    return [state.layerId];
  },

  // Gets a human-friendly description of the visualization
  getDescription() {
    return {
      icon: chartMetricSVG,
      label: i18n.translate('xpack.lens.blueMetric.label', {
        defaultMessage: 'Blue Metric',
      }),
    };
  },

  // See previous comment on this function
  getSuggestions,

  // Initializes the visualization. If state is defined, we are
  // initializing from a saved state. If it is not defined, we
  // are initializing a new state.
  initialize(frame, state) {
    return (
      state || {
        // This is hacky. If you dig into what addNewLayer is doing,
        // you'll see that it is effectful, and ultimately ends up
        // modifying the datasource state, causing a React re-render.
        // This is really not an ideal thing to do in an init function.
        // I think we can and should rethink how initialization works so
        // that it can be done in a non-effectful way.
        layerId: frame.addNewLayer(),
        accessor: generateId(),
      }
    );
  },

  getPersistableState: state => state,

  renderLayerConfigPanel: (domElement, props) =>
    render(
      <I18nProvider>
        <MetricConfigPanel {...props} />
      </I18nProvider>,
      domElement
    ),

  toExpression,
  toPreviewExpression: (state: State, frame: FramePublicAPI) =>
    toExpression(state, frame, 'reduced'),
};

// The setup function, registers the expression functions, renderers, and
// returns the Lens plugin.
export function blueMetricVisualizationSetup() {
  const { expressions } = npSetup.plugins;
  expressions.registerFunction(() => blueMetricChartExpression);
  expressions.registerRenderer(() => getMetricChartRenderer(getFormat));
  return metricVisualization;
}
