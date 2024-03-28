import Contract from 'web3-eth-contract'
import { AbiItem } from 'web3-utils'

import Web3Adapter from '@safe-global/protocol-kit/adapters/web3/Web3Adapter'
import CreateCallBaseContract from '@safe-global/protocol-kit/adapters/CreateCallBaseContract'
import { SafeVersion } from '@safe-global/safe-core-sdk-types'

/**
 * Abstract class CreateCallBaseContractWeb3 extends CreateCallBaseContract to specifically integrate with the Web3.js v6 library.
 * It is designed to be instantiated for different versions of the Safe contract.
 *
 * This abstract class sets up the Web3 v6 Contract object that interacts with a CreateCall contract version.
 *
 * Subclasses of CreateCallBaseContractWeb3 are expected to represent specific versions of the contract.
 *
 * @template CreateCallContractAbiType - The ABI type specific to the version of the CreateCall contract, extending InterfaceAbi from Web3.
 * @extends CreateCallBaseContract<CreateCallContractAbiType> - Extends the generic CreateCallBaseContract with Web3-specific implementation.
 *
 * Example subclasses:
 * - CreateCallContract_v1_4_1_Web3 extends CreateCallBaseContractWeb3<CreateCallContract_v1_4_1_Abi>
 * - CreateCallContract_v1_3_0_Web3 extends CreateCallBaseContractWeb3<CreateCallContract_v1_3_0_Abi>
 */
abstract class CreateCallBaseContractWeb3<
  CreateCallContractAbiType extends AbiItem[]
> extends CreateCallBaseContract<CreateCallContractAbiType> {
  contract: Contract
  adapter: Web3Adapter

  /**
   * @constructor
   * Constructs an instance of CreateCallBaseContractWeb3.
   *
   * @param chainId - The chain ID of the contract.
   * @param web3Adapter - An instance of Web3Adapter.
   * @param defaultAbi - The default ABI for the CreateCall contract. It should be compatible with the specific version of the contract.
   * @param safeVersion - The version of the Safe contract.
   * @param customContractAddress - Optional custom address for the contract. If not provided, the address is derived from the Safe deployments based on the chainId and safeVersion.
   * @param customContractAbi - Optional custom ABI for the contract. If not provided, the ABI is derived from the Safe deployments or the defaultAbi is used.
   */
  constructor(
    chainId: bigint,
    web3Adapter: Web3Adapter,
    defaultAbi: CreateCallContractAbiType,
    safeVersion: SafeVersion,
    customContractAddress?: string,
    customContractAbi?: CreateCallContractAbiType
  ) {
    super(chainId, defaultAbi, safeVersion, customContractAddress, customContractAbi)

    this.adapter = web3Adapter
    this.contract = web3Adapter.getContract(this.contractAddress, this.contractAbi)
  }
}

export default CreateCallBaseContractWeb3