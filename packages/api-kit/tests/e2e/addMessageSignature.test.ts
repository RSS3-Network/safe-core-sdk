import Safe, {
  EthSafeSignature,
  buildSignatureBytes,
  hashSafeMessage,
  SigningMethod,
  buildContractSignature
} from '@safe-global/protocol-kit'
import { EthAdapter, SafeMessage } from '@safe-global/safe-core-sdk-types'
import SafeApiKit from '@safe-global/api-kit/index'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { getServiceClient } from '../utils/setupServiceClient'

chai.use(chaiAsPromised)

let safeApiKit1: SafeApiKit
let protocolKit: Safe
let ethAdapter1: EthAdapter
let ethAdapter2: EthAdapter

const generateRandomUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const generateMessage = () => `${generateRandomUUID()}: I am the owner of the safe`
const safeAddress = '0xF8ef84392f7542576F6b9d1b140334144930Ac78'
const signerSafeAddress = '0xDa8dd250065F19f7A29564396D7F13230b9fC5A3'

describe('addMessageSignature', () => {
  before(async () => {
    ;({ safeApiKit: safeApiKit1, ethAdapter: ethAdapter1 } = await getServiceClient(
      '0x83a415ca62e11f5fa5567e98450d0f82ae19ff36ef876c10a8d448c788a53676'
    ))
    ;({ ethAdapter: ethAdapter2 } = await getServiceClient(
      '0xb88ad5789871315d0dab6fc5961d6714f24f35a6393f13a6f426dfecfc00ab44'
    ))
  })

  it('should fail if safeAddress is empty', async () => {
    await chai
      .expect(safeApiKit1.addMessageSignature('', '0x'))
      .to.be.rejectedWith('Invalid messageHash or signature')
  })

  it('should fail if signature is empty', async () => {
    await chai
      .expect(safeApiKit1.addMessageSignature(safeAddress, ''))
      .to.be.rejectedWith('Invalid messageHash or signature')
  })

  describe('when adding a new message', () => {
    beforeEach(async () => {
      protocolKit = await Safe.create({
        ethAdapter: ethAdapter1,
        safeAddress
      })
    })

    it('should allow to add a confirmation signature using the EIP-712', async () => {
      const rawMessage: string = generateMessage()
      let safeMessage: SafeMessage = protocolKit.createMessage(rawMessage)
      safeMessage = await protocolKit.signMessage(safeMessage, 'eth_sign')

      let signerAddress = (await ethAdapter1.getSignerAddress()) || '0x'

      await chai.expect(
        safeApiKit1.addMessage(safeAddress, {
          message: rawMessage,
          signature: safeMessage.getSignature(signerAddress)?.data || '0x'
        })
      ).to.be.fulfilled

      protocolKit = await protocolKit.connect({ ethAdapter: ethAdapter2 })
      safeMessage = await protocolKit.signMessage(safeMessage, 'eth_signTypedData_v4')

      const safeMessageHash = await protocolKit.getSafeMessageHash(hashSafeMessage(rawMessage))
      signerAddress = (await ethAdapter2.getSignerAddress()) || '0x'

      await chai.expect(
        safeApiKit1.addMessageSignature(
          safeMessageHash,
          safeMessage.getSignature(signerAddress)?.data || '0x'
        )
      ).to.be.fulfilled

      const confirmedMessage = await safeApiKit1.getMessage(safeMessageHash)

      chai.expect(confirmedMessage.confirmations.length).to.eq(2)
    })

    it('should allow to add a confirmation signature using a Safe signer', async () => {
      protocolKit = await protocolKit.connect({
        ethAdapter: ethAdapter1,
        safeAddress
      })

      const rawMessage: string = generateMessage()
      const safeMessageHash = await protocolKit.getSafeMessageHash(hashSafeMessage(rawMessage))

      let safeMessage: SafeMessage = protocolKit.createMessage(rawMessage)
      safeMessage = await protocolKit.signMessage(safeMessage, 'eth_sign')

      const signerAddress = (await ethAdapter1.getSignerAddress()) || '0x'
      const ethSig = safeMessage.getSignature(signerAddress) as EthSafeSignature

      await chai.expect(
        safeApiKit1.addMessage(safeAddress, {
          message: rawMessage,
          signature: buildSignatureBytes([ethSig])
        })
      ).to.be.fulfilled

      protocolKit = await protocolKit.connect({
        ethAdapter: ethAdapter1,
        safeAddress: signerSafeAddress
      })
      let signerSafeMessage = protocolKit.createMessage(rawMessage)
      signerSafeMessage = await protocolKit.signMessage(
        signerSafeMessage,
        SigningMethod.SAFE_SIGNATURE,
        safeAddress
      )

      protocolKit = await protocolKit.connect({
        ethAdapter: ethAdapter2,
        safeAddress: signerSafeAddress
      })
      signerSafeMessage = await protocolKit.signMessage(
        signerSafeMessage,
        SigningMethod.SAFE_SIGNATURE,
        safeAddress
      )

      const signerSafeSig = await buildContractSignature(
        Array.from(signerSafeMessage.signatures.values()),
        signerSafeAddress
      )

      protocolKit = await protocolKit.connect({
        ethAdapter: ethAdapter1,
        safeAddress
      })

      const signature = buildSignatureBytes([signerSafeSig, ethSig])

      const isValidSignature = await protocolKit.isValidSignature(
        hashSafeMessage(rawMessage),
        signature
      )

      chai.expect(isValidSignature).to.be.true

      const contractSig = buildSignatureBytes([signerSafeSig])

      await chai.expect(safeApiKit1.addMessageSignature(safeMessageHash, contractSig)).to.be
        .fulfilled

      const confirmedMessage = await safeApiKit1.getMessage(safeMessageHash)
      chai.expect(confirmedMessage.confirmations.length).to.eq(2)
    })
  })
})
