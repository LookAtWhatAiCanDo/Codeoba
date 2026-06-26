# What AI Can Do, LLC: Codeoba-Tauri App Signing Guide

This document contains company-wide instructions for signing desktop applications built under **What AI Can Do, LLC** in the **Codeoba-Tauri** repository for macOS and Windows.

---

### ⚠️ Platform Signing Models: The Core Difference

Before setting up or modifying configurations, it is critical to understand that macOS and Windows use completely different code-signing architectures.  
Applying the concepts of one platform to the other will cause confusion:

1. **Apple / macOS (File-Based Certificate Model):**
   - **Uses traditional certificate files.** You generate a Certificate Signing Request (CSR), submit it to the Apple Developer Portal, download a `.cer` file, and import it into Keychain Access.
   - You then export the certificate and its private key as a password-protected **`.p12` file** (which is PKCS#12—the same format as a Windows `.pfx` file).
   - This `.p12` file is base64-encoded and uploaded directly to GitHub Secrets (`MACOS_CERTIFICATE_P12` / `MACOS_INSTALLER_CERTIFICATE_P12`) so the macOS CI runner can sign the bundle locally.
   - This service is included in the $99/year Apple Developer account.

2. **Microsoft / Windows (Cloud-Based Service Model):**
   - **NO local `.pfx` or certificate files are used.** Microsoft acts as the Certificate Authority and stores the signing keys securely on their cloud HSM (Hardware Security Module) via the **Artifact Signing** service (formerly *Trusted Signing*).
   - You **do not** purchase certificates from third parties (like DigiCert or Sectigo), you **do not** download any `.pfx` files, and you **do not** store any signing password secrets in GitHub.
   - GitHub Actions authenticates keylessly using **OpenID Connect (OIDC)** via an Entra ID App Registration, and sends the built installer to the regional Azure endpoint to be signed in the cloud.
   - This service costs $9.99/month on Azure:  
     https://azure.microsoft.com/en-us/pricing/details/artifact-signing/

---

## Apple/macOS Setup

* Create a Certificate Signing Request (CSR) per:  
  https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request
    * Launch `/Applications/Utilities/Keychain Access`.
    * Choose Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority.
    * User Email Address: `<developer-email>`
    * Common Name: `<developer-name>`
    * CA Email Address: (leave empty)
    * Request is: Saved to disk
    * Continue
    * Save to `CertificateSigningRequest-WhatAiCanDo.certSigningRequest`
** alternatively (unverified) **
```
openssl req -new -newkey rsa:2048 -nodes -keyout private.key -out request.csr -subj "/O=What AI Can Do, LLC/CN=What AI Can Do LLC CSR"
```

* `Developer ID Application`
    * https://developer.apple.com/account/resources/certificates/list
    * `Create a certificate`
    * https://developer.apple.com/account/resources/certificates/add
    * `Developer ID Application`
    * `G2 Sub-CA (Xcode 11.4.1 or later)`
    * Choose File > `CertificateSigningRequest-WhatAiCanDo.certSigningRequest`
    * Continue
    * Download (ex: `developerID_application-WhatAiCanDo.cer`)
    * Import back into Keychain Access
    * Launch `/Applications/Utilities/Keychain Access`.
    * File > Import Items...
    * Select `developerID_application-WhatAiCanDo.cer`
        * Export as `.p12`:
        * Default Keychains > login > My Certificates > `Developer ID Application: What Ai Can Do, LLC`
        * Right-click the certificate and choose Export "Developer ID Application...".
        * `developerID_application-WhatAiCanDo.p12`
        * Enter a secure password to encrypt the private key inside the .p12 file.
    * `base64 -i developerID_application-WhatAiCanDo.p12 | pbcopy`
    * Paste that value in the below GitHub secret `MACOS_CERTIFICATE_P12`.

* `Developer ID Application`
    * `Developer ID Installer` (Repeat similar steps if signing `.pkg` installer packages).
    * `base64 -i developerID_installer-WhatAiCanDo.p12 | pbcopy`
    * Paste that value in the below GitHub secret `MACOS_INSTALLER_CERTIFICATE_P12`.

---

## 🚀 GitHub Actions CI/CD Integration (macOS)

The desktop build pipeline integrates macOS code signing and Apple notarization automatically when building release binaries via Tauri.

### 1. Required Configuration Parameters

To authenticate and sign, configure these parameters in your GitHub Repository settings:

#### Secrets (Sensitive)
https://github.com/LookAtWhatAiCanDo/Codeoba-Tauri/settings/secrets/actions:
| Secret Name | Description |
| :--- | :--- |
| `MACOS_CERTIFICATE_P12` | Base64-encoded string of the `developerID_application-WhatAiCanDo.p12` file (for `.app` / `.dmg` signing). |
| `MACOS_CERTIFICATE_PASSWORD` | The password used to encrypt the application `.p12` file. |
| `MACOS_INSTALLER_CERTIFICATE_P12` | Base64-encoded string of the `developerID_installer-WhatAiCanDo.p12` file (for `.pkg` signing). |
| `MACOS_INSTALLER_CERTIFICATE_PASSWORD` | The password used to encrypt the installer `.p12` file. |
| `APPLE_ID_PASSWORD` | App-specific password generated from your Apple ID account page (`appleid.apple.com`). |

> [!NOTE]
> **How to get the `APPLE_ID_PASSWORD`:**
> 1. Navigate to https://account.apple.com/account/manage/section/security.
> 2. Select **App-Specific Passwords**.
> 3. Click **Generate an app-specific password** (or select the `+` button).
> 4. Enter a descriptive label (e.g. `WhatAiCanDo Notarization CI`).
> 5. Click **Create** and complete the verification.
> 6. Copy the generated 16-character password (`xxxx-xxxx-xxxx-xxxx`) and paste it as the `APPLE_ID_PASSWORD` secret in GitHub.  
>    Do not use your primary Apple ID login password, as it will fail due to 2FA.

#### Variables (Non-Sensitive)
https://github.com/LookAtWhatAiCanDo/Codeoba-Tauri/settings/variables/actions:
| Variable Name | Description |
| :--- | :--- |
| `APPLE_ID` | `<developer-email>` |
| `APPLE_TEAM_ID` | `<apple-team-id>`: This identifier is public in your app bundle anyway. |

### 2. How it Works in CI
During workflow execution on the `macos-latest` runner:
1. If `MACOS_CERTIFICATE_P12` is defined, the runner decodes it into a temporary keychain.
2. It queries the keychain for the installed certificate identity and exports it to `$APPLE_SIGNING_IDENTITY`.
3. The build process runs `npm run tauri build`. Tauri detects the certificates in the keychain, signs the application, and uses `APPLE_ID` and `APPLE_ID_PASSWORD` to upload it to Apple's notarization servers.
4. The temporary keychain is deleted during the cleanup step.

---

## Microsoft/Windows Setup (Artifact Signing & OIDC)

Windows `.msi` and `.exe` installers are signed post-build on the GitHub Actions runner using **Artifact Signing** (formerly *Azure Code Signing* / *Trusted Signing*).  
Microsoft acts as the Certificate Authority, removing the need to buy or manage third-party code-signing certificates.

Authentication is managed securely via **OpenID Connect (OIDC)**. This eliminates the need to store long-lived Entra ID credentials (like client secrets, passwords, or certificate files) in GitHub, though identifier parameters (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`) are still configured as GitHub secrets to identify the targets.

References:
* https://learn.microsoft.com/en-us/azure/artifact-signing/
* https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart

---

### 1. Azure Portal Setup

Follow these steps to set up the signing infrastructure in Azure.

#### Step 1: Sign Up
NOTE: DO NOT USE INDIVIDUAL SIGN UP! Individual sign up generates a weird `${user}${domain}.onmicrosoft.com` domain name that cannot be changed. Only a Windows 365 Business Trial sign up can specify a custom `${domain}.onmicrosoft.com` domain name.

1. Windows 365 Business Trial:  
   https://www.microsoft.com/en-us/windows-365/business/windows-365-free-trial
   * Sign up with your billing email and specify your default Azure domain name.
2. Cancel trial:  
   https://admin.cloud.microsoft/?source=applauncher#/subscriptions
   * Select the business trial subscription.
   * Click **Edit recurring billing** and choose **Cancel on expiration**.
3. Add Custom Domain:  
   https://entra.microsoft.com/#view/Microsoft_AAD_IAM/DomainsManagementMenuBlade/~/CustomDomainNames
   * Add `whataicando.com` and verify DNS records.
   * Make `whataicando.com` Primary.
4. Setup Users:  
   https://portal.azure.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers
   * Update the primary administrator properties to change the User Principal Name to `<admin-user>@whataicando.com`.
   * Create other admin and developer accounts as needed, assigning appropriate user `Global Administrator` roles and subscription `Owner` roles.

NOTE: Don't be fooled by `$200 free credits` trial offers! If you proceed without upgrading to a `Basic` `pay-as-you-go` account, you will eventually hit this error:
> `"Artifact Signing is not available for free, trial or sponsored subscriptions. Upgrade to a paid subscription to proceed."`

#### Step 2: Sign In
1. Sign in to Azure Portal at https://portal.azure.com/.

#### Step 3: Register the Artifact Signing resource provider
https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart#register-the-artifact-signing-resource-provider
1. In either the search box or under **All services**, select **Subscriptions**.
2. Select the subscription where you want to create Artifact Signing resources.
3. On the resource menu under **Settings**, select **Resource providers**.
4. In the list of resource providers, select **Microsoft.CodeSigning**.  
   (By default, status is `NotRegistered`).
5. Select the ellipsis, and then select **Register**.  
   After a few minutes the status of the resource provider changes to **Registered**.

#### Step 4: Create an Artifact Signing account
https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart#create-an-artifact-signing-account
1. Search for and then select **Artifact Signing Accounts**.
2. On the Artifact Signing Accounts pane, select **Create**.
3. For **Subscription**, select your Azure subscription.
4. For **Resource group**, select **Create new**, and then enter `<resource-group-name>`.
5. For **Account name**, enter `<signing-account-name>`.
6. For **Region**, select `Central US` / `US Central`.
7. For **Pricing**, select `Basic (9.99 USD/month)`.
8. Select **Review + Create**, then **Create**.
9. Once created, select **Go to resource**.

#### Step 5: Assign Verification and Signing Roles
Assign roles to your team members or service principals to manage and utilize the Artifact Signing account:
1. Go to your **Artifact Signing Account** page in the Azure portal.
2. Click **Access Control (IAM)** -> **Add** -> **Add role assignment**.
3. Grant identity validation access:
   - Search for **`Artifact Signing Identity Verifier`** role.
   - Click **Next** -> **+ Select members**.
   - Add the administrator emails responsible for verifying the company status.
   - Click **Review + assign** to save.
4. Grant local developer signing access:
   - Click **Add** -> **Add role assignment**.
   - Search for **`Artifact Signing Certificate Profile Signer`** role.
   - Click **Next** -> **+ Select members**.
   - Add local developer emails who need permission to sign from their local command line.
   - Click **Review + assign** to save.

#### Step 6: Create an Identity Validation Request
https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart#create-an-identity-validation-request
1. On the Artifact Signing account Overview pane, select **Identity validations** under **Objects** in the left menu.
2. Select **Organization**, select **New Identity**, and then select **Public**.
3. Fill in your official business legal details:
    * **Organization name**: `<Legal Business Entity Name>` (e.g., `What AI Can Do, LLC`)
    * **Website url**: `https://whataicando.com`
    * **Primary email**: `<Corporate Verification Contact Email>`
    * **Secondary email(s)**: `<Backup Verification Contact Email>`
    * **Business identifier**: `Duns Number` - `143057449`
    * **Seller ID**: `95014920` (from https://partner.microsoft.com/en-us/dashboard/account/v3/organization/legalinfo#developer)
    * **Street address**: `<Street Address>`
    * **City**: `<City>`
    * **Country**: `<Country>`
    * **State**: `<State>`
    * **Postal code**: `<Postal Code>`
    * Requester info: **First name**: `<First Name>`, **Last name**: `<Last Name>` (Must match your government-issued ID)
    * Accept terms and select **Create**.
4. When the request is successfully created, the status changes to `In Progress`.
5. After 5-10+ minutes the status will change to `Action Required`.  
   `AU10TIX` (Microsoft's third-party identity verification service) will send a verification link to the primary email provided above.
6. Complete **Identity Validation - Individual Developer**:
    1. Select your name under the validations list to open the right-side blade, and click the verification link.
    2. Click **Get verified here through our trusted ID-verifiers** to launch `AU10TIX`.
    3. Click **Let’s Begin** and enter the verification email address. Enter the PIN code sent to your email to verify.
    4. Provide your phone number and scan the QR code with your mobile camera.
    5. On your phone, capture your government-issued ID (Passport, Driver's License) as prompted.
    6. Once the photo verifier is complete, tap **Open Authenticator** on your phone and add the Verified ID.
    7. Return to the browser and scan the presentation QR code to share the Verified ID from your Microsoft Authenticator app.
    8. The browser will update to: **Verification Successful**.
7. It takes 5-10+ minutes for the Azure portal to update.  
   The validation status will change to **Completed**.

#### Step 7: Create a Certificate Profile
https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart#create-a-certificate-profile
1. On the Artifact Signing account menu under **Objects**, select **Certificate profiles**.
2. Click **Create** and select **Public Trust**.
3. Configure the profile:
    * **Certificate Profile Name**: `<certificate-profile-name>`
    * **Verified CN and O**: Select the validated business identity.
    * ~~Check `Include street address` and `Include postal code` if they must be visible on the signature certificate subject.~~
4. Click **Create**.

---

### 2. Microsoft Entra ID (OIDC Connection) Setup

Follow these steps to set up keyless authentication (OIDC) between GitHub Actions and Azure:

1. Navigate to the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. In the left menu under **Entra ID**, select **App registrations** -> **New registration**.
3. Configure the registration:
   * **Name:** Enter corporate signing client name.
   * **Supported account types:** Select **`Accounts in this organizational directory only (Single tenant)`**.
4. Click **Register**.
5. Note/Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page for later use.

#### Step 2: Configure Federated Credentials (OIDC)
Authorize your GitHub repository to authenticate securely:
1. **Create the GitHub Environment:**
   - In your `Codeoba-Tauri` GitHub Repository, go to **Settings** -> **Environments** -> **New environment**.
   - Name the environment **`Production`** and click **Configure environment**.
2. **Add Federated Credential in Azure:**
   - In the Entra signing client App Registration, select **Certificates & secrets** in the left menu.
   - Select the **Federated credentials** tab at the top and click **Add credential**.
   - Select the scenario: **`GitHub Actions active on a repository`**.
   - Fill in your repository details:
     * **Organization:** Enter `LookAtWhatAiCanDo`.
     * **Repository:** Enter the repository name (`Codeoba-Tauri`).
     * **Entity type:** Select **`Environment`**.
     * **Environment:** Enter **`Production`**.
     * **Name:** Enter a descriptive identifier (e.g., `GitHub-LookAtWhatAiCanDo-CodeobaTauri-Environment-Production`).
   - Click **Add**.

#### Step 3: Grant Signing Permission to the App
Grant your Entra App Registration permission to sign using your Artifact Signing account:
1. Open your **Artifact Signing Account** page in the Azure portal.
2. Click **Access control (IAM)** -> **Add** -> **Add role assignment**.
3. Search for the role **`Artifact Signing Certificate Profile Signer`** and click **Next**.
4. Under **Members**, keep *User, group, or service principal* selected and click **+ Select members**.
5. Search for your Entra signing client App Registration, select it, and click **Select**.
6. Click **Review + assign** to save.

---

## 🚀 GitHub Actions CI/CD Integration (Windows)

The desktop build pipeline uses `azure/login` to authenticate via OIDC, and `azure/artifact-signing-action` to sign the built package post-build.

### 1. Required Configuration Parameters

Configure these parameters in your GitHub Repository settings under **Settings** -> **Secrets and variables** -> **Actions**:

#### Secrets (Sensitive)
These are added as **Repository Secrets** because they contain GUIDs specific to your Azure subscription:

| Secret Name | Description |
| :--- | :--- |
| `AZURE_CLIENT_ID` | The **Application (client) ID** of your Entra App Registration. |
| `AZURE_TENANT_ID` | The **Directory (tenant) ID** of your Entra App Registration. |
| `AZURE_SUBSCRIPTION_ID` | The **Subscription ID** your Azure subscription. |

#### Variables (Non-Sensitive)
These are added as **Repository Variables**:

| Variable Name | Description |
| :--- | :--- |
| `AZURE_SIGNING_ACCOUNT_NAME` | The name of your Azure Artifact Signing Account |
| `AZURE_CERTIFICATE_PROFILE_NAME` | The name of your Certificate Profile |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | `https://cus.codesigning.azure.net/` (Central US) |

---

### 2. How it Works in CI
During workflow execution on the `windows-latest` runner when a release tag is pushed:
1. The runner requests a temporary OIDC token from GitHub's token authority.
2. The `Azure Login` step uses this OIDC token to authenticate against Azure Entra ID using the client, tenant, and subscription IDs.
3. The runner builds the unsigned package (`npm run tauri build`).
4. The `Sign MSI installer with Azure Artifact Signing` step connects to the Artifact Signing service using the logged-in context, signs the generated packages inside the output bundle directory (`src-tauri/target/release/bundle/msi`), and appends a secure timestamp.

```yaml
      - name: Azure Login
        if: matrix.platform == 'windows' && startsWith(github.ref, 'refs/tags/v')
        uses: azure/login@v3
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Sign MSI installer with Azure Artifact Signing
        if: matrix.platform == 'windows' && startsWith(github.ref, 'refs/tags/v')
        uses: azure/artifact-signing-action@v2
        with:
          endpoint: ${{ vars.AZURE_TRUSTED_SIGNING_ENDPOINT || 'https://cus.codesigning.azure.net/' }}
          signing-account-name: ${{ vars.AZURE_SIGNING_ACCOUNT_NAME }}
          certificate-profile-name: ${{ vars.AZURE_CERTIFICATE_PROFILE_NAME }}
          files-folder: 'src-tauri/target/release/bundle/msi'
          files-folder-filter: 'msi'
          file-digest: 'SHA512'
          timestamp-digest: 'SHA512'
          timestamp-rfc3161: 'http://timestamp.acs.microsoft.com'
```

---

## 📊 Monitoring & Logging

When release builds are signed in CI/CD, execution and verification activity is logged in three separate places:

### 1. GitHub Actions Logs (Runner Execution)
The console output of the `azure/artifact-signing-action` step shows:
- The list of discovered files.
- File hashes (digests) and signing results.
- The regional signing endpoint and certificate profile used.

### 2. Entra ID Sign-In Logs (OIDC Authentication)
Every time GitHub Actions logs in keylessly, it registers as a sign-in event under your service principal App Registration in Microsoft Entra.
* **Where to find it:**
  1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/).
  2. In the left menu, select **Identity** -> **Monitoring & health** -> **Sign-in logs**.
  3. Select the **Service principal sign-ins** tab.
  4. Look for your corporate signing client App Registration. If OIDC login fails, the exact error description and token claims are listed here.

### 3. Artifact Signing Account Logs (Transaction & Audit)
* **Administrative Audit Logs:** Account-level changes (creating profiles, editing access control) are logged under the **Activity log** tab of your Artifact Signing Account in the Azure portal.
* **Individual File Signing Transaction Logs:** To keep a detailed record of every individual file signed, configure a **Diagnostic setting** targeting an Azure Storage Account. 
  *(Note: Microsoft's Artifact Signing service currently has a known integration issue where transaction logs fail to ingest into Log Analytics workspaces, making them appear empty. Routing to a Storage Account is the reliable, working workaround).*
  1. Go to your **Artifact Signing Account** page in the Azure portal.
  2. Under **Monitoring** in the left menu, select **Diagnostic settings** -> **Edit setting** (on your existing audit setting) or **+ Add diagnostic setting**.
  3. Configure the settings:
     * **Diagnostic setting name:** `whataicando-signing-audit`.
     * **Logs:** Check **`Sign Transactions`** (this logs the actual files signed). Under **Category groups**, check **`audit`** (this logs admin events).
     * **Destination details:** Check **`Archive to a storage account`** (leave *Send to Log Analytics workspace* unchecked).
     * **Subscription / Storage Account:** Select your active subscription and choose or create a simple Azure Storage Account (e.g., `whataicandosigningstore`).
  4. Click **Save** in the top left.
  5. Once saved, every signing transaction will write a JSON log blob inside your storage account under the container `insights-logs-signtransactions`.

### How to View the Log Files:
Azure automatically packages and exports logs to your storage account hourly.
1. In the Azure portal, search for and open your **Storage Account** (`whataicandostorage`).
2. In the left-hand menu under **Data storage**, select **Containers**.
3. Click on the container named **`insights-logs-signtransactions`** (this container is created automatically after your first signed release build runs).
4. Navigate through the folder hierarchy which is organized by date and time:
   `resourceId=.../y=<year>/m=<month>/d=<day>/h=<hour>/m=<minute>/`
5. Click on the file named **`PT1H.json`**.
6. Since these are **Append Blobs** (which Azure Monitor uses to write logs sequentially), the Azure Portal's built-in **Edit** or **Preview** tab will display a warning (*"Only block blobs can be edited from the Portal"*) and will not render the contents.
7. To view the log data, you must use one of the following methods:
   - **Download the file:** Click the **Download** button and open the `.json` file in your local text editor.
   - **Use Azure Storage Explorer:** Use the desktop application (available from the [Azure Storage Explorer Download Page](https://azure.microsoft.com/en-us/products/storage-explorer#Download-4)) to double-click and open the file directly.
   - **Use Azure CLI:** Run the following command to download and display the contents directly in your terminal screen without saving a local file:
     ```bash
     az storage blob download \
       --account-name whataicandostorage \
       --container-name insights-logs-signtransactions \
       --name "<full-blob-path-copied-from-portal-properties>" \
       --file /dev/stdout \
       --auth-mode login
     ```
