import { safeVersionDeployed } from '@safe-global/protocol-kit/hardhat/deploy/deploy-contracts'
import Safe, {
  PredictedSafeProps,
  SafeTransactionOptionalProps
} from '@safe-global/protocol-kit/index'
import { SENTINEL_ADDRESS, ZERO_ADDRESS } from '@safe-global/protocol-kit/utils/constants'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { deployments } from 'hardhat'
import { getContractNetworks } from './utils/setupContractNetworks'
import {
  getDailyLimitModule,
  getSafeWithOwners,
  getSocialRecoveryModule
} from './utils/setupContracts'
import { getEthAdapter } from './utils/setupEthAdapter'
import { getAccounts } from './utils/setupTestNetwork'
import { waitSafeTxReceipt } from './utils/transactions'

chai.use(chaiAsPromised)

describe('Safe modules manager', () => {
  const setupTests = deployments.createFixture(async ({ deployments, getChainId }) => {
    await deployments.fixture()
    const accounts = await getAccounts()
    const chainId = BigInt(await getChainId())
    const contractNetworks = await getContractNetworks(chainId)
    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig: {
        owners: [accounts[0].address],
        threshold: 1
      },
      safeDeploymentConfig: {
        safeVersion: safeVersionDeployed
      }
    }
    return {
      dailyLimitModule: await getDailyLimitModule(),
      socialRecoveryModule: await getSocialRecoveryModule(),
      safe: await getSafeWithOwners([accounts[0].address]),
      accounts,
      contractNetworks,
      predictedSafe
    }
  })

  describe('getModules', async () => {
    it('should fail if the Safe is not deployed', async () => {
      const { predictedSafe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        predictedSafe,
        contractNetworks
      })
      chai.expect(safeSdk.getModules()).to.be.rejectedWith('Safe is not deployed')
    })

    it('should return all the enabled modules', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      chai.expect((await safeSdk.getModules()).length).to.be.eq(0)
      const tx = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse = await safeSdk.executeTransaction(tx)
      await waitSafeTxReceipt(txResponse)
      chai.expect((await safeSdk.getModules()).length).to.be.eq(1)
    })
  })

  describe('getModulesPaginated', async () => {
    it('should fail if the Safe is not deployed', async () => {
      const { predictedSafe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        predictedSafe,
        contractNetworks
      })
      chai
        .expect(safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10))
        .to.be.rejectedWith('Safe is not deployed')
    })

    it('should return the enabled modules', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10)).length).to.be.eq(0)
      const tx = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse = await safeSdk.executeTransaction(tx)
      await waitSafeTxReceipt(txResponse)
      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10)).length).to.be.eq(1)
    })

    it('should constraint returned modules by pageSize', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks, socialRecoveryModule } =
        await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const dailyLimitsAddress = await await dailyLimitModule.getAddress()
      const socialRecoveryAddress = await await socialRecoveryModule.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })

      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10)).length).to.be.eq(0)
      const txDailyLimits = await safeSdk.createEnableModuleTx(dailyLimitsAddress)
      const dailyLimitsResponse = await safeSdk.executeTransaction(txDailyLimits)
      await waitSafeTxReceipt(dailyLimitsResponse)
      const txSocialRecovery = await safeSdk.createEnableModuleTx(socialRecoveryAddress)
      const soecialRecoveryResponse = await safeSdk.executeTransaction(txSocialRecovery)
      await waitSafeTxReceipt(soecialRecoveryResponse)

      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10)).length).to.be.eq(2)
      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 1)).length).to.be.eq(1)
      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 1)).length).to.be.eq(1)
    })

    it('should offset the returned modules', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks, socialRecoveryModule } =
        await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const dailyLimitsAddress = await await dailyLimitModule.getAddress()
      const socialRecoveryAddress = await await socialRecoveryModule.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })

      const txDailyLimits = await safeSdk.createEnableModuleTx(dailyLimitsAddress)
      const dailyLimitsResponse = await safeSdk.executeTransaction(txDailyLimits)
      await waitSafeTxReceipt(dailyLimitsResponse)
      const txSocialRecovery = await safeSdk.createEnableModuleTx(socialRecoveryAddress)
      const soecialRecoveryResponse = await safeSdk.executeTransaction(txSocialRecovery)
      await waitSafeTxReceipt(soecialRecoveryResponse)

      const [firstModule, secondModule] = await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10)

      chai.expect((await safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 10)).length).to.be.eq(2)
      chai.expect((await safeSdk.getModulesPaginated(firstModule, 10)).length).to.be.eq(1)
      chai.expect((await safeSdk.getModulesPaginated(secondModule, 10)).length).to.be.eq(0)
    })

    it('should fail if pageSize is invalid', async () => {
      const { predictedSafe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        predictedSafe,
        contractNetworks
      })

      chai
        .expect(safeSdk.getModulesPaginated(SENTINEL_ADDRESS, 0))
        .to.be.rejectedWith('Invalid page size for fetching paginated modules')
    })
  })

  describe('isModuleEnabled', async () => {
    it('should fail if the Safe is not deployed', async () => {
      const { predictedSafe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        predictedSafe,
        contractNetworks
      })
      const tx = safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())
      chai.expect(tx).to.be.rejectedWith('Safe is not deployed')
    })

    it('should return true if a module is enabled', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.false
      const tx = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse = await safeSdk.executeTransaction(tx)
      await waitSafeTxReceipt(txResponse)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.true
    })
  })

  describe('createEnableModuleTx', async () => {
    it('should fail if the Safe is not deployed', async () => {
      const { predictedSafe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        predictedSafe,
        contractNetworks
      })
      const tx = safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      chai.expect(tx).to.be.rejectedWith('Safe is not deployed')
    })

    it('should fail if address is invalid', async () => {
      const { safe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createEnableModuleTx('0x123')
      await chai.expect(tx).to.be.rejectedWith('Invalid module address provided')
    })

    it('should fail if address is equal to sentinel', async () => {
      const { safe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createEnableModuleTx(SENTINEL_ADDRESS)
      await chai.expect(tx).to.be.rejectedWith('Invalid module address provided')
    })

    it('should fail if address is equal to 0x address', async () => {
      const { safe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createEnableModuleTx(ZERO_ADDRESS)
      await chai.expect(tx).to.be.rejectedWith('Invalid module address provided')
    })

    it('should fail if address is already enabled', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx1 = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse = await safeSdk.executeTransaction(tx1)
      await waitSafeTxReceipt(txResponse)
      const tx2 = safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      await chai.expect(tx2).to.be.rejectedWith('Module provided is already enabled')
    })

    it('should build the transaction with the optional props', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const options: SafeTransactionOptionalProps = {
        baseGas: '111',
        gasPrice: '222',
        gasToken: '0x333',
        refundReceiver: '0x444',
        nonce: 555,
        safeTxGas: '666'
      }
      const tx = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress(), options)
      chai.expect(tx.data.baseGas).to.be.eq('111')
      chai.expect(tx.data.gasPrice).to.be.eq('222')
      chai.expect(tx.data.gasToken).to.be.eq('0x333')
      chai.expect(tx.data.refundReceiver).to.be.eq('0x444')
      chai.expect(tx.data.nonce).to.be.eq(555)
      chai.expect(tx.data.safeTxGas).to.be.eq('666')
    })

    it('should enable a Safe module', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      chai.expect((await safeSdk.getModules()).length).to.be.eq(0)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.false
      const tx = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse = await safeSdk.executeTransaction(tx)
      await waitSafeTxReceipt(txResponse)
      chai.expect((await safeSdk.getModules()).length).to.be.eq(1)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.true
    })
  })

  describe('createDisableModuleTx', async () => {
    it('should fail if the Safe is not deployed', async () => {
      const { predictedSafe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        predictedSafe,
        contractNetworks
      })
      const tx = safeSdk.createDisableModuleTx(await dailyLimitModule.getAddress())
      chai.expect(tx).to.be.rejectedWith('Safe is not deployed')
    })

    it('should fail if address is invalid', async () => {
      const { safe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createDisableModuleTx('0x123')
      await chai.expect(tx).to.be.rejectedWith('Invalid module address provided')
    })

    it('should fail if address is equal to sentinel', async () => {
      const { safe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createDisableModuleTx(SENTINEL_ADDRESS)
      await chai.expect(tx).to.be.rejectedWith('Invalid module address provided')
    })

    it('should fail if address is equal to 0x address', async () => {
      const { safe, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createDisableModuleTx(ZERO_ADDRESS)
      await chai.expect(tx).to.be.rejectedWith('Invalid module address provided')
    })

    it('should fail if address is not enabled', async () => {
      const { safe, accounts, dailyLimitModule, contractNetworks } = await setupTests()
      const [account1] = accounts
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeAddress = await safe.getAddress()
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })
      const tx = safeSdk.createDisableModuleTx(await dailyLimitModule.getAddress())
      await chai.expect(tx).to.be.rejectedWith('Module provided is not enabled yet')
    })

    it('should build the transaction with the optional props', async () => {
      const { dailyLimitModule, accounts, contractNetworks } = await setupTests()
      const [account1] = accounts
      const safe = await getSafeWithOwners([account1.address])
      const safeAddress = await safe.getAddress()
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })

      const tx1 = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse1 = await safeSdk.executeTransaction(tx1)
      await waitSafeTxReceipt(txResponse1)
      chai.expect((await safeSdk.getModules()).length).to.be.eq(1)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.true

      const options: SafeTransactionOptionalProps = {
        baseGas: '111',
        gasPrice: '222',
        gasToken: '0x333',
        refundReceiver: '0x444',
        nonce: 555,
        safeTxGas: '666'
      }
      const tx2 = await safeSdk.createDisableModuleTx(await dailyLimitModule.getAddress(), options)
      chai.expect(tx2.data.baseGas).to.be.eq('111')
      chai.expect(tx2.data.gasPrice).to.be.eq('222')
      chai.expect(tx2.data.gasToken).to.be.eq('0x333')
      chai.expect(tx2.data.refundReceiver).to.be.eq('0x444')
      chai.expect(tx2.data.nonce).to.be.eq(555)
      chai.expect(tx2.data.safeTxGas).to.be.eq('666')
    })

    it('should disable Safe modules', async () => {
      const { dailyLimitModule, accounts, socialRecoveryModule, contractNetworks } =
        await setupTests()
      const [account1] = accounts
      const safe = await getSafeWithOwners([account1.address])
      const safeAddress = await safe.getAddress()
      const ethAdapter = await getEthAdapter(account1.signer)
      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress,
        contractNetworks
      })

      const tx1 = await safeSdk.createEnableModuleTx(await dailyLimitModule.getAddress())
      const txResponse1 = await safeSdk.executeTransaction(tx1)
      await waitSafeTxReceipt(txResponse1)
      const tx2 = await safeSdk.createEnableModuleTx(await socialRecoveryModule.getAddress())
      const txResponse2 = await safeSdk.executeTransaction(tx2)
      await waitSafeTxReceipt(txResponse2)
      chai.expect((await safeSdk.getModules()).length).to.be.eq(2)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.true
      chai.expect(await safeSdk.isModuleEnabled(await socialRecoveryModule.getAddress())).to.be.true

      const tx3 = await safeSdk.createDisableModuleTx(await dailyLimitModule.getAddress())
      const txResponse3 = await safeSdk.executeTransaction(tx3)
      await waitSafeTxReceipt(txResponse3)
      chai.expect((await safeSdk.getModules()).length).to.be.eq(1)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.false
      chai.expect(await safeSdk.isModuleEnabled(await socialRecoveryModule.getAddress())).to.be.true

      const tx4 = await safeSdk.createDisableModuleTx(await socialRecoveryModule.getAddress())
      const txResponse4 = await safeSdk.executeTransaction(tx4)
      await waitSafeTxReceipt(txResponse4)
      chai.expect((await safeSdk.getModules()).length).to.be.eq(0)
      chai.expect(await safeSdk.isModuleEnabled(await dailyLimitModule.getAddress())).to.be.false
      chai.expect(await safeSdk.isModuleEnabled(await socialRecoveryModule.getAddress())).to.be
        .false
    })
  })
})
