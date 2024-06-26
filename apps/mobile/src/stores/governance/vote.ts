import {
  ChainGetter,
  ObservableChainQuery,
  ObservableChainQueryMap,
  QuerySharedContext,
} from '@keplr-wallet/stores';
import {ProposalVoter} from './types';

export class ObservableQueryProposalVoteInner extends ObservableChainQuery<ProposalVoter> {
  protected proposalId: string;
  protected bech32Address: string;

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    proposalsId: string,
    bech32Address: string,
  ) {
    super(
      sharedContext,
      chainId,
      chainGetter,
      `/cosmos/gov/v1beta1/proposals/${proposalsId}/votes/${bech32Address}`,
    );
    this.proposalId = proposalsId;
    this.bech32Address = bech32Address;
  }

  get vote(): 'Yes' | 'Abstain' | 'No' | 'NoWithVeto' | 'Unspecified' {
    if (!this.response) {
      return 'Unspecified';
    }

    switch (this.response.data.vote.option) {
      case 'VOTE_OPTION_YES':
        return 'Yes';
      case 'VOTE_OPTION_ABSTAIN':
        return 'Abstain';
      case 'VOTE_OPTION_NO':
        return 'No';
      case 'VOTE_OPTION_NO_WITH_VETO':
        return 'NoWithVeto';
      default:
        return 'Unspecified';
    }
  }
  refetch() {
    this.fetch();
  }
  protected override canFetch(): boolean {
    // If bech32 address is empty, it will always fail, so don't need to fetch it.
    return this.bech32Address.length > 0;
  }
}

export class ObservableQueryProposalVote extends ObservableChainQueryMap<ProposalVoter> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
  ) {
    super(sharedContext, chainId, chainGetter, (param: string) => {
      const {proposalId, voter} = JSON.parse(param);

      return new ObservableQueryProposalVoteInner(
        this.sharedContext,
        this.chainId,
        this.chainGetter,
        proposalId,
        voter,
      );
    });
  }

  getVote(proposalId: string, voter: string): ObservableQueryProposalVoteInner {
    const param = JSON.stringify({
      proposalId,
      voter,
    });
    return this.get(param) as ObservableQueryProposalVoteInner;
  }
}
