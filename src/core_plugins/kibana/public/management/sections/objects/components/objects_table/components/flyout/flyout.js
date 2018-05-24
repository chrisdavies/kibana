import React, { Component, Fragment } from 'react';
import PropTypes from 'prop-types';
import { groupBy, take } from 'lodash';
import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiButtonEmpty,
  EuiButton,
  EuiText,
  EuiTitle,
  EuiForm,
  EuiFormRow,
  EuiSwitch,
  EuiFilePicker,
  EuiInMemoryTable,
  EuiSelect,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingKibana,
  EuiCallOut,
  EuiSpacer,
  EuiLink,
} from '@elastic/eui';
import { importFile } from '../../../../lib/import_file';
import {
  resolveSavedObjects,
  resolveSavedSearches,
  resolveIndexPatternConflicts,
  saveObjects,
} from '../../../../lib/resolve_saved_objects';
import { INCLUDED_TYPES } from '../../objects_table';

export class Flyout extends Component {
  static propTypes = {
    close: PropTypes.func.isRequired,
    done: PropTypes.func.isRequired,
    services: PropTypes.array.isRequired,
    newIndexPatternUrl: PropTypes.string.isRequired,
    indexPatterns: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);

    this.state = {
      conflictedIndexPatterns: undefined,
      conflictedSavedObjectsLinkedToSavedSearches: undefined,
      conflictedSearchDocs: undefined,
      conflicts: undefined,
      error: undefined,
      file: undefined,
      importCount: 0,
      indexPatterns: undefined,
      isOverwriteAllChecked: true,
      isLoading: false,
      loadingMessage: undefined,
      wasImportSuccessful: false,
      migrationState: {},
    };
  }

  componentDidMount() {
    this.fetchIndexPatterns();
  }

  fetchIndexPatterns = async () => {
    const indexPatterns = await this.props.indexPatterns.getFields([
      'id',
      'title',
    ]);
    this.setState({ indexPatterns });
  };

  changeOverwriteAll = () => {
    this.setState(state => ({
      isOverwriteAllChecked: !state.isOverwriteAllChecked,
    }));
  };

  setImportFile = ([file]) => {
    this.setState({ file });
  };

  import = async () => {
    const { services, indexPatterns } = this.props;
    const { file, isOverwriteAllChecked } = this.state;

    this.setState({ isLoading: true, error: undefined });

    let contents;

    try {
      contents = await importFile(file);
    } catch (e) {
      this.setState({
        isLoading: false,
        error: 'The file could not be processed.',
      });
      return;
    }

    const { migrationState = {}, docs = contents } = contents;

    if (!Array.isArray(docs)) {
      this.setState({
        isLoading: false,
        error: 'Saved objects file format is invalid and cannot be imported.',
      });
      return;
    }

    const {
      conflictedIndexPatterns,
      conflictedSavedObjectsLinkedToSavedSearches,
      conflictedSearchDocs,
      importedObjectCount,
    } = await resolveSavedObjects(
      docs.filter(content =>
        INCLUDED_TYPES.includes(content._type)
      ),
      isOverwriteAllChecked,
      services,
      indexPatterns,
      migrationState,
    );

    const byId = groupBy(conflictedIndexPatterns, ({ obj }) =>
      obj.searchSource.getOwn('index')
    );
    const conflicts = Object.entries(byId).reduce(
      (accum, [existingIndexPatternId, list]) => {
        accum.push({
          existingIndexPatternId,
          newIndexPatternId: undefined,
          list: list.map(({ doc }) => ({
            id: existingIndexPatternId,
            type: doc._type,
            name: doc._source.title,
          })),
        });
        return accum;
      },
      []
    );

    this.setState({
      conflictedIndexPatterns,
      conflictedSavedObjectsLinkedToSavedSearches,
      conflictedSearchDocs,
      conflicts,
      importCount: importedObjectCount,
      isLoading: false,
      wasImportSuccessful: conflicts.length === 0,
      migrationState,
    });
  };

  get hasConflicts() {
    return this.state.conflicts && this.state.conflicts.length > 0;
  }

  get resolutions() {
    return this.state.conflicts.reduce(
      (accum, { existingIndexPatternId, newIndexPatternId }) => {
        if (newIndexPatternId) {
          accum.push({
            oldId: existingIndexPatternId,
            newId: newIndexPatternId,
          });
        }
        return accum;
      },
      []
    );
  }

  confirmImport = async () => {
    const {
      conflictedIndexPatterns,
      isOverwriteAllChecked,
      conflictedSavedObjectsLinkedToSavedSearches,
      conflictedSearchDocs,
      migrationState,
    } = this.state;

    const { services, indexPatterns } = this.props;

    this.setState({
      error: undefined,
      isLoading: true,
      loadingMessage: undefined,
    });

    let importCount = this.state.importCount;

    if (this.hasConflicts) {
      try {
        const resolutions = this.resolutions;

        // Do not Promise.all these calls as the order matters
        this.setState({ loadingMessage: 'Resolving conflicts...' });
        if (resolutions.length) {
          importCount += await resolveIndexPatternConflicts(
            resolutions,
            conflictedIndexPatterns,
            isOverwriteAllChecked,
            migrationState,
          );
        }
        this.setState({ loadingMessage: 'Saving conflicts...' });
        importCount += await saveObjects(
          conflictedSavedObjectsLinkedToSavedSearches,
          isOverwriteAllChecked,
          migrationState,
        );
        this.setState({
          loadingMessage: 'Ensure saved searches are linked properly...',
        });
        importCount += await resolveSavedSearches(
          conflictedSearchDocs,
          services,
          indexPatterns,
          isOverwriteAllChecked,
          migrationState,
        );
      } catch (e) {
        this.setState({
          error: e.message,
          isLoading: false,
          loadingMessage: undefined,
        });
        return;
      }
    }

    this.setState({ isLoading: false, wasImportSuccessful: true, importCount });
  };

  onIndexChanged = (id, e) => {
    const value = e.target.value;
    this.setState(state => {
      const conflictIndex = state.conflicts.findIndex(
        conflict => conflict.existingIndexPatternId === id
      );
      if (conflictIndex === -1) {
        return state;
      }

      return {
        conflicts: [
          ...state.conflicts.slice(0, conflictIndex),
          {
            ...state.conflicts[conflictIndex],
            newIndexPatternId: value,
          },
          ...state.conflicts.slice(conflictIndex + 1),
        ],
      };
    });
  };

  renderConflicts() {
    const { conflicts } = this.state;

    if (!conflicts) {
      return null;
    }

    const columns = [
      {
        field: 'existingIndexPatternId',
        name: 'ID',
        description: `ID of the index pattern`,
        sortable: true,
      },
      {
        field: 'list',
        name: 'Count',
        description: `How many affected objects`,
        render: list => {
          return <Fragment>{list.length}</Fragment>;
        },
      },
      {
        field: 'list',
        name: 'Sample of affected objects',
        description: `Sample of affected objects`,
        render: list => {
          return (
            <ul style={{ listStyle: 'none' }}>
              {take(list, 3).map((obj, key) => <li key={key}>{obj.name}</li>)}
            </ul>
          );
        },
      },
      {
        field: 'existingIndexPatternId',
        name: 'New index pattern',
        render: id => {
          const options = this.state.indexPatterns.map(indexPattern => ({
            text: indexPattern.get('title'),
            value: indexPattern.id,
          }));

          options.unshift({
            text: '-- Skip Import --',
            value: '',
          });

          return (
            <EuiSelect
              data-test-subj="managementChangeIndexSelection"
              onChange={e => this.onIndexChanged(id, e)}
              options={options}
            />
          );
        },
      },
    ];

    const pagination = {
      pageSizeOptions: [5, 10, 25],
    };

    return (
      <EuiInMemoryTable
        items={conflicts}
        columns={columns}
        pagination={pagination}
      />
    );
  }

  renderError() {
    const { error } = this.state;

    if (!error) {
      return null;
    }

    return (
      <Fragment>
        <EuiCallOut
          title="Sorry, there was an error"
          color="danger"
          iconType="cross"
        >
          <p>{error}</p>
        </EuiCallOut>
        <EuiSpacer size="s" />
      </Fragment>
    );
  }

  renderBody() {
    const {
      isLoading,
      loadingMessage,
      isOverwriteAllChecked,
      wasImportSuccessful,
      importCount,
    } = this.state;

    if (isLoading) {
      return (
        <EuiFlexGroup justifyContent="spaceAround">
          <EuiFlexItem grow={false}>
            <EuiLoadingKibana size="xl" />
            <EuiSpacer size="m" />
            <EuiText>
              <p>{loadingMessage}</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    if (wasImportSuccessful) {
      return (
        <EuiCallOut title="Import successful" color="success" iconType="check">
          <p>Successfully imported {importCount} objects.</p>
        </EuiCallOut>
      );
    }

    if (this.hasConflicts) {
      return this.renderConflicts();
    }

    return (
      <EuiForm>
        <EuiFormRow label="Please select a JSON file to import">
          <EuiFilePicker
            initialPromptText="Import"
            onChange={this.setImportFile}
          />
        </EuiFormRow>
        <EuiFormRow>
          <EuiSwitch
            name="overwriteAll"
            label="Automatically overwrite all saved objects?"
            data-test-subj="importSavedObjectsOverwriteToggle"
            checked={isOverwriteAllChecked}
            onChange={this.changeOverwriteAll}
          />
        </EuiFormRow>
      </EuiForm>
    );
  }

  renderFooter() {
    const { isLoading, wasImportSuccessful } = this.state;
    const { done, close } = this.props;

    let confirmButton;

    if (wasImportSuccessful) {
      confirmButton = (
        <EuiButton
          onClick={done}
          size="s"
          fill
          data-test-subj="importSavedObjectsDoneBtn"
        >
          Done
        </EuiButton>
      );
    } else if (this.hasConflicts) {
      confirmButton = (
        <EuiButton
          onClick={this.confirmImport}
          size="s"
          fill
          isLoading={isLoading}
          data-test-subj="importSavedObjectsConfirmBtn"
        >
          Confirm all changes
        </EuiButton>
      );
    } else {
      confirmButton = (
        <EuiButton
          onClick={this.import}
          size="s"
          fill
          isLoading={isLoading}
          data-test-subj="importSavedObjectsImportBtn"
        >
          Import
        </EuiButton>
      );
    }

    return (
      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty onClick={close} size="s">
            Cancel
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>{confirmButton}</EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  renderSubheader() {
    if (
      !this.hasConflicts ||
      this.state.isLoading ||
      this.state.wasImportSuccessful
    ) {
      return null;
    }

    return (
      <Fragment>
        <EuiSpacer size="s" />
        <EuiCallOut
          title="Index Pattern Conflicts"
          color="warning"
          iconType="help"
        >
          <p>
            The following saved objects use index patterns that do not exist.
            Please select the index patterns you&apos;d like re-associated with
            them. You can{' '}
            {
              <EuiLink href={this.props.newIndexPatternUrl}>
                create a new index pattern
              </EuiLink>
            }{' '}
            if necessary.
          </p>
        </EuiCallOut>
      </Fragment>
    );
  }

  render() {
    const { close } = this.props;

    return (
      <EuiFlyout onClose={close}>
        <EuiFlyoutHeader>
          <EuiTitle>
            <h2>Import saved objects</h2>
          </EuiTitle>
          {this.renderSubheader()}
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {this.renderError()}
          {this.renderBody()}
        </EuiFlyoutBody>

        <EuiFlyoutFooter>{this.renderFooter()}</EuiFlyoutFooter>
      </EuiFlyout>
    );
  }
}
