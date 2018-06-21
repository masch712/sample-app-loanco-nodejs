var express = require('express');
var router = express.Router();

var _ = require('lodash');

var docusign = require('docusign-esign'),
  async = require('async'),
  fs = require('fs'),
  path = require('path');

router.get('/close_window', function(req, res, next) {
	res.send("<script>window.frameElement.parentElement.ownerDocument.defaultView.close()</script>");
});

router.get('/sign_form', function(req, res, next) {
	var body = req.body;
	var docName = req.query.FORM_TYPE === 'VACCINE' ? 'Clinical Data Registry Form' : "W9";

	// create an envelope that will store the document(s), field(s), and recipient(s)
	var envDef = new docusign.EnvelopeDefinition();
	envDef.setEmailSubject(docName);
	envDef.setEmailBlurb('Please sign form.');

	// add a document to the envelope
	var doc = new docusign.Document();

  if (req.query.FORM_TYPE === 'VACCINE') {
    var file1Base64 = app.helpers.getLocalDocument('pdfs/clinical_data_registry_form.pdf');
  }
  else {
    var file1Base64 = app.helpers.getLocalDocument('pdfs/w9.pdf');
  }
	doc.setDocumentBase64(file1Base64);
	doc.setName('Document'); // can be different from actual file name
	doc.setFileExtension('docx');
	doc.setDocumentId('1'); // hardcode so we can easily refer to this document later

	var docs = [];
	docs.push(doc);
	envDef.setDocuments(docs);


	// Recipient
	var recipientId = '2';
	var signer = new docusign.Signer();
	signer.setEmail(app.config.auth.EmployeeEmail);
	signer.setName(app.config.auth.EmployeeName);
	signer.setRecipientId(recipientId);
  body.inputSigningLocation = 'embedded';
  if(body.inputSigningLocation == 'embedded'){
		signer.setClientUserId('1001');
	}
	if(body.inputAuthentication == 'phone'){
		app.helpers.addPhoneAuthToRecipient(signer, body.inputPhone);
	}
	if(body.inputAccessCode && body.inputAccessCode.length){
		signer.setAccessCode(body.inputAccessCode);
	}


	// Tabs

	// can have multiple tabs, so need to add to envelope as a single element list
	var tabList = {
		// text: [],
		// email: [],
		fullName: [],
		signHere: [],
		// initialHere: [],
		dateSigned: [],
		// formula: [],
		// number: []
	}

	// Note: using anchorStrings (in tabs below) makes documentId and pageNumber irrelevant (they affect all documents and pages)
  //
	// FullName
	if (req.query.FORM_TYPE === 'VACCINE') {
    tabList.fullName.push(app.helpers.makeTab('FullName', {
      recipientId: recipientId,
      xPosition: '100',
      yPosition: '590',
      pageNumber: '7',
      documentId: '1',
    }));
  }
  else {
    tabList.dateSigned.push(app.helpers.makeTab('DateSigned', {
      recipientId: recipientId,
      xPosition: '450',
      yPosition: '525',
      pageNumber: '1',
      documentId: '1',
    }));
	}

	// CDRF: SignHere
	if(req.query.FORM_TYPE === 'VACCINE') {
    tabList.signHere.push(app.helpers.makeTab('SignHere', {
      recipientId: recipientId,
      xPosition: '100',
      yPosition: '525',
      pageNumber: '7',
      documentId: '1',
    }));
  }
  else {
    // W-9: SignHere
    tabList.signHere.push(app.helpers.makeTab('SignHere', {
    	recipientId: recipientId,
    	anchorString: 'Signature of U.S. person',
    	anchorXOffset: '75',
    	anchorYOffset: '20',
    }));
	}


	var tabs = new docusign.Tabs();
	if (req.query.FORM_TYPE === 'VACCINE') {
    tabs.setFullNameTabs(tabList.fullName);
  }
	tabs.setSignHereTabs(tabList.signHere);
	// tabs.setInitialHereTabs(tabList.initialHere);
	tabs.setDateSignedTabs(tabList.dateSigned);

	signer.setTabs(tabs);

	// add recipients (in this case a single signer) to the envelope
	envDef.setRecipients(new docusign.Recipients());
	envDef.getRecipients().setSigners([]);
	envDef.getRecipients().getSigners().push(signer);

	// send the envelope by setting |status| to "sent". To save as a draft set to "created"
	// - note that the envelope will only be 'sent' when it reaches the DocuSign server with the 'sent' status (not in the following call)
	envDef.setStatus('sent');

	// instantiate a new EnvelopesApi object
	var envelopesApi = new docusign.EnvelopesApi();

	app.helpers.removeEmptyAndNulls(envDef);

	// call the createEnvelope() API
	envelopesApi.createEnvelope(app.config.auth.AccountId, envDef, null, function (error, envelopeSummary, response) {
		if (error) {
			console.error('Error: ' + response);
			console.error(envelopeSummary);
			res.send('Error creating envelope, please try again');
			return;
		}

		// Create and save envelope locally (temporary)
		app.helpers.createAndSaveLocal(req, envelopeSummary.envelopeId)
		.then(function(){

			if(body.inputSigningLocation == 'embedded'){
				app.helpers.getRecipientUrl(envelopeSummary.envelopeId, signer, function(err, data){
					if(err){
						res.send('Error with getRecipientUrl, please try again');
						return console.error(err);
					}

					req.session.envelopeId = envelopeSummary.envelopeId;
					req.session.signingUrl = data.getUrl();

					res.redirect('/sign/embedded');


				});
			} else {
				res.redirect('/sign/remote');
			}
		});

	});
});

module.exports = router;

