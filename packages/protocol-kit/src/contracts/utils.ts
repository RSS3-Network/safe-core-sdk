import { isAddress, zeroPadValue } from 'ethers'
import { keccak_256 } from '@noble/hashes/sha3'
import { DEFAULT_SAFE_VERSION } from '@safe-global/protocol-kit/contracts/config'
import { EMPTY_DATA, ZERO_ADDRESS } from '@safe-global/protocol-kit/utils/constants'
import { createMemoizedFunction } from '@safe-global/protocol-kit/utils/memoized'
import {
  EthAdapter,
  SafeContract,
  SafeProxyFactoryContract,
  SafeVersion
} from '@safe-global/safe-core-sdk-types'
import { generateAddress2, keccak256, toBuffer } from 'ethereumjs-util'
import semverSatisfies from 'semver/functions/satisfies'

import {
  GetContractInstanceProps,
  GetSafeContractInstanceProps,
  getCompatibilityFallbackHandlerContract,
  getProxyFactoryContract,
  getSafeContract
} from '../contracts/safeDeploymentContracts'
import { ContractNetworkConfig, SafeAccountConfig, SafeDeploymentConfig } from '../types'

// keccak256(toUtf8Bytes('Safe Account Abstraction'))
export const PREDETERMINED_SALT_NONCE =
  '0xb1073742015cbcf5a3a4d9d1ae33ecf619439710b89475f92e2abd2117e90f90'

const ZKSYNC_MAINNET = 324n
const ZKSYNC_TESTNET = 280n
// For bundle size efficiency we store SafeProxy.sol/GnosisSafeProxy.sol zksync bytecode hash in hex.
// To get the values below we need to:
// 1. Compile Safe smart contracts for zksync
// 2. Get `deployedBytecode` from SafeProxy.json/GnosisSafeProxy.json
// 3. Use zksync-web3 SDK to get the bytecode hash
//    const bytecodeHash = zkSyncUtils.hashBytecode(${deployedBytecode})
// 4. Use ethers to convert the array into hex
//    const deployedBytecodeHash = ethers.hexlify(bytecodeHash)
const ZKSYNC_SAFE_PROXY_DEPLOYED_BYTECODE: {
  [version: string]: { deployedBytecodeHash: string }
} = {
  '1.3.0': {
    deployedBytecodeHash: '0x0100004124426fb9ebb25e27d670c068e52f9ba631bd383279a188be47e3f86d'
  }
}

// keccak256(toUtf8Bytes('zksyncCreate2'))
const ZKSYNC_CREATE2_PREFIX = '0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494'

export interface PredictSafeAddressProps {
  ethAdapter: EthAdapter
  chainId: bigint // required for performance
  safeAccountConfig: SafeAccountConfig
  safeDeploymentConfig?: SafeDeploymentConfig
  isL1SafeSingleton?: boolean
  customContracts?: ContractNetworkConfig
}

export interface encodeSetupCallDataProps {
  ethAdapter: EthAdapter
  safeAccountConfig: SafeAccountConfig
  safeContract: SafeContract
  customContracts?: ContractNetworkConfig
  customSafeVersion?: SafeVersion
}

export function encodeCreateProxyWithNonce(
  safeProxyFactoryContract: SafeProxyFactoryContract,
  safeSingletonAddress: string,
  initializer: string,
  salt?: string
) {
  return safeProxyFactoryContract.encode('createProxyWithNonce', [
    safeSingletonAddress,
    initializer,
    salt || PREDETERMINED_SALT_NONCE
  ])
}

const memoizedGetCompatibilityFallbackHandlerContract = createMemoizedFunction(
  getCompatibilityFallbackHandlerContract
)

export async function encodeSetupCallData({
  ethAdapter,
  safeAccountConfig,
  safeContract,
  customContracts,
  customSafeVersion
}: encodeSetupCallDataProps): Promise<string> {
  const {
    owners,
    threshold,
    to = ZERO_ADDRESS,
    data = EMPTY_DATA,
    fallbackHandler,
    paymentToken = ZERO_ADDRESS,
    payment = 0,
    paymentReceiver = ZERO_ADDRESS
  } = safeAccountConfig

  const safeVersion = customSafeVersion || (await safeContract.getVersion())

  if (semverSatisfies(safeVersion, '<=1.0.0')) {
    return safeContract.encode('setup', [
      owners,
      threshold,
      to,
      data,
      paymentToken,
      payment,
      paymentReceiver
    ])
  }

  let fallbackHandlerAddress = fallbackHandler
  const isValidAddress = fallbackHandlerAddress !== undefined && isAddress(fallbackHandlerAddress)
  if (!isValidAddress) {
    const fallbackHandlerContract = await memoizedGetCompatibilityFallbackHandlerContract({
      ethAdapter,
      safeVersion,
      customContracts
    })

    fallbackHandlerAddress = await fallbackHandlerContract.getAddress()
  }

  return safeContract.encode('setup', [
    owners,
    threshold,
    to,
    data,
    fallbackHandlerAddress,
    paymentToken,
    payment,
    paymentReceiver
  ])
}

// we need to include the chainId as string to prevent memoization issues see: https://github.com/safe-global/safe-core-sdk/issues/598
type MemoizedGetProxyFactoryContractProps = GetContractInstanceProps & { chainId: string }
type MemoizedGetSafeContractInstanceProps = GetSafeContractInstanceProps & { chainId: string }

const memoizedGetProxyFactoryContract = createMemoizedFunction(
  ({ ethAdapter, safeVersion, customContracts }: MemoizedGetProxyFactoryContractProps) =>
    getProxyFactoryContract({ ethAdapter, safeVersion, customContracts })
)

const memoizedGetProxyCreationCode = createMemoizedFunction(
  async ({
    ethAdapter,
    safeVersion,
    customContracts,
    chainId
  }: MemoizedGetProxyFactoryContractProps) => {
    const safeProxyFactoryContract = await memoizedGetProxyFactoryContract({
      ethAdapter,
      safeVersion,
      customContracts,
      chainId
    })

    return safeProxyFactoryContract.proxyCreationCode()
  }
)

const memoizedGetSafeContract = createMemoizedFunction(
  ({
    ethAdapter,
    safeVersion,
    isL1SafeSingleton,
    customContracts
  }: MemoizedGetSafeContractInstanceProps) =>
    getSafeContract({ ethAdapter, safeVersion, isL1SafeSingleton, customContracts })
)

/**
 * Provides a chain-specific default salt nonce for generating unique addresses
 * for the same Safe configuration across different chains.
 *
 * @param {bigint} chainId - The chain ID associated with the chain.
 * @returns {string} The chain-specific salt nonce in hexadecimal format.
 */
export function getChainSpecificDefaultSaltNonce(chainId: bigint): string {
  return `0x${Buffer.from(keccak_256(PREDETERMINED_SALT_NONCE + chainId)).toString('hex')}`
}

export async function getPredictedSafeAddressInitCode({
  ethAdapter,
  chainId,
  safeAccountConfig,
  safeDeploymentConfig = {},
  isL1SafeSingleton = false,
  customContracts
}: PredictSafeAddressProps): Promise<string> {
  validateSafeAccountConfig(safeAccountConfig)
  validateSafeDeploymentConfig(safeDeploymentConfig)

  const {
    safeVersion = DEFAULT_SAFE_VERSION,
    saltNonce = getChainSpecificDefaultSaltNonce(chainId)
  } = safeDeploymentConfig

  const safeProxyFactoryContract = await memoizedGetProxyFactoryContract({
    ethAdapter,
    safeVersion,
    customContracts,
    chainId: chainId.toString()
  })

  const safeContract = await memoizedGetSafeContract({
    ethAdapter,
    safeVersion,
    isL1SafeSingleton,
    customContracts,
    chainId: chainId.toString()
  })

  const initializer = await encodeSetupCallData({
    ethAdapter,
    safeAccountConfig,
    safeContract,
    customContracts,
    customSafeVersion: safeVersion // it is more efficient if we provide the safeVersion manually
  })

  const encodedNonce = toBuffer(ethAdapter.encodeParameters(['uint256'], [saltNonce])).toString(
    'hex'
  )
  const safeSingletonAddress = await safeContract.getAddress()
  const initCodeCallData = encodeCreateProxyWithNonce(
    safeProxyFactoryContract,
    safeSingletonAddress,
    initializer,
    '0x' + encodedNonce
  )
  const safeProxyFactoryAddress = await safeProxyFactoryContract.getAddress()
  const initCode = `0x${[safeProxyFactoryAddress, initCodeCallData].reduce(
    (acc, x) => acc + x.replace('0x', ''),
    ''
  )}`

  return initCode
}

export async function predictSafeAddress({
  ethAdapter,
  chainId,
  safeAccountConfig,
  safeDeploymentConfig = {},
  isL1SafeSingleton = false,
  customContracts
}: PredictSafeAddressProps): Promise<string> {
  validateSafeAccountConfig(safeAccountConfig)
  validateSafeDeploymentConfig(safeDeploymentConfig)

  const {
    safeVersion = DEFAULT_SAFE_VERSION,
    saltNonce = getChainSpecificDefaultSaltNonce(chainId)
  } = safeDeploymentConfig

  const safeProxyFactoryContract = await memoizedGetProxyFactoryContract({
    ethAdapter,
    safeVersion,
    customContracts,
    chainId: chainId.toString()
  })

  const proxyCreationCode = await memoizedGetProxyCreationCode({
    ethAdapter,
    safeVersion,
    customContracts,
    chainId: chainId.toString()
  })

  const safeContract = await memoizedGetSafeContract({
    ethAdapter,
    safeVersion,
    isL1SafeSingleton,
    customContracts,
    chainId: chainId.toString()
  })

  const initializer = await encodeSetupCallData({
    ethAdapter,
    safeAccountConfig,
    safeContract,
    customContracts,
    customSafeVersion: safeVersion // it is more efficient if we provide the safeVersion manually
  })

  const encodedNonce = toBuffer(ethAdapter.encodeParameters(['uint256'], [saltNonce])).toString(
    'hex'
  )
  const salt = keccak256(
    toBuffer('0x' + keccak256(toBuffer(initializer)).toString('hex') + encodedNonce)
  )
  const input = ethAdapter.encodeParameters(['address'], [await safeContract.getAddress()])
  const from = await safeProxyFactoryContract.getAddress()

  // On the zkSync Era chain, the counterfactual deployment address is calculated differently
  const isZkSyncEraChain = [ZKSYNC_MAINNET, ZKSYNC_TESTNET].includes(chainId)
  if (isZkSyncEraChain) {
    const proxyAddress = zkSyncEraCreate2Address(from, safeVersion, salt, input)

    return ethAdapter.getChecksummedAddress(proxyAddress)
  }

  const constructorData = toBuffer(input).toString('hex')
  const initCode = proxyCreationCode + constructorData
  const proxyAddress =
    '0x' + generateAddress2(toBuffer(from), toBuffer(salt), toBuffer(initCode)).toString('hex')
  const predictedAddress = ethAdapter.getChecksummedAddress(proxyAddress)

  return predictedAddress
}

export const validateSafeAccountConfig = ({ owners, threshold }: SafeAccountConfig): void => {
  if (owners.length <= 0) throw new Error('Owner list must have at least one owner')
  if (threshold <= 0) throw new Error('Threshold must be greater than or equal to 1')
  if (threshold > owners.length)
    throw new Error('Threshold must be lower than or equal to owners length')
}

export const validateSafeDeploymentConfig = ({ saltNonce }: SafeDeploymentConfig): void => {
  if (saltNonce && BigInt(saltNonce) < 0)
    throw new Error('saltNonce must be greater than or equal to 0')
}

/**
 * Generates a zkSync Era address. zkSync Era uses a distinct address derivation method compared to Ethereum
 * see: https://era.zksync.io/docs/reference/architecture/differences-with-ethereum.html#address-derivation
 *
 * @param {string} from - The sender's address.
 * @param {SafeVersion} safeVersion - The version of the safe.
 * @param {Buffer} salt - The salt used for address derivation.
 * @param {string} input - Additional input data for the derivation.
 *
 * @returns {string} The derived zkSync Era address.
 */
export function zkSyncEraCreate2Address(
  from: string,
  safeVersion: SafeVersion,
  salt: Buffer,
  input: string
): string {
  const bytecodeHash = ZKSYNC_SAFE_PROXY_DEPLOYED_BYTECODE[safeVersion].deployedBytecodeHash
  const inputHash = keccak256(toBuffer(input))

  const addressBytes = keccak256(
    toBuffer(
      ZKSYNC_CREATE2_PREFIX +
        zeroPadValue(from, 32).slice(2) +
        salt.toString('hex') +
        bytecodeHash.slice(2) +
        inputHash.toString('hex')
    )
  )
    .toString('hex')
    .slice(24)

  return addressBytes
}
